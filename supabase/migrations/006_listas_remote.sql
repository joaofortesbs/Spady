-- Apply ONLY this forward migration. Do not replay the legacy migration directory.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TABLE public.listas_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision text NOT NULL DEFAULT '0',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.listas_lists (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,id),
  UNIQUE (user_id,position) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE public.listas_items (
  user_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  list_id text NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 10000),
  position integer NOT NULL CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,list_id) REFERENCES public.listas_lists(user_id,id) ON DELETE CASCADE,
  UNIQUE (user_id,list_id,position) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE public.listas_images (
  user_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  item_id text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 4),
  object_path text NOT NULL CHECK (object_path ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
    AND split_part(object_path,'/',1)=user_id::text),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,item_id) REFERENCES public.listas_items(user_id,id) ON DELETE CASCADE,
  UNIQUE (user_id,item_id,position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX listas_images_object_path_idx ON public.listas_images(object_path);
CREATE TABLE public.listas_imports (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_key text NOT NULL CHECK (length(import_key) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,import_key)
);

ALTER TABLE public.listas_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY listas_accounts_read ON public.listas_accounts FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY listas_lists_read ON public.listas_lists FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY listas_items_read ON public.listas_items FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY listas_images_read ON public.listas_images FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY listas_imports_read ON public.listas_imports FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.listas_accounts,public.listas_lists,public.listas_items,public.listas_images,public.listas_imports FROM anon,authenticated;
GRANT SELECT ON public.listas_accounts,public.listas_lists,public.listas_items,public.listas_images,public.listas_imports TO authenticated;

CREATE FUNCTION public.listas_read_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u uuid := auth.uid(); result jsonb;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  -- One SQL statement = one consistent snapshot, even during concurrent saves.
  SELECT jsonb_build_object('version',1,'owner',u::text,
    'revision',coalesce((SELECT revision FROM public.listas_accounts WHERE user_id=u),'0'),
    'lists',coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'description',l.description,
        'items',coalesce((
          SELECT jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'description',i.description,
            'images',coalesce((
              SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'objectPath',m.object_path,
                'mimeType',m.mime_type,'byteSize',m.byte_size) ORDER BY m.position)
              FROM public.listas_images m WHERE m.user_id=u AND m.item_id=i.id
            ),'[]'::jsonb)) ORDER BY i.position)
          FROM public.listas_items i WHERE i.user_id=u AND i.list_id=l.id
        ),'[]'::jsonb)) ORDER BY l.position)
      FROM public.listas_lists l WHERE l.user_id=u
    ),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.listas_commit_v1(p_owner uuid, p_revision text, p_lists jsonb, p_import_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  u uuid := auth.uid(); current_revision text; payload jsonb := p_lists;
  l jsonb; i jsonb; m jsonb; lp bigint; ip bigint; mp bigint;
  list_ids text[] := '{}'; item_ids text[] := '{}'; image_ids text[] := '{}';
  used_ids text[] := '{}'; revision_next text;
BEGIN
  IF u IS NULL OR u IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  -- Acquired before row locks; every write and protected object deletion shares this lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('listas:'||u::text,0));
  IF p_import_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.listas_imports WHERE user_id=u AND import_key=p_import_key
  ) THEN RETURN public.listas_read_v1(); END IF;
  INSERT INTO public.listas_accounts(user_id) VALUES(u) ON CONFLICT DO NOTHING;
  SELECT revision INTO current_revision FROM public.listas_accounts WHERE user_id=u FOR UPDATE;
  IF p_import_key IS NULL AND p_revision IS DISTINCT FROM current_revision THEN
    RAISE EXCEPTION 'Lists changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid lists' USING ERRCODE='22023';
  END IF;
  IF p_import_key IS NOT NULL THEN
    IF length(p_import_key) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Invalid import key' USING ERRCODE='22023';
    END IF;
    -- Never overwrite an already-remote list with a divergent browser copy.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(payload) e
      JOIN public.listas_lists old ON old.user_id=u AND old.id=e->>'id') THEN
      RAISE EXCEPTION 'Local list conflicts with an existing remote list' USING ERRCODE='40001';
    END IF;
    payload := (public.listas_read_v1()->'lists') || payload;
  END IF;
  FOR l,lp IN SELECT value,ordinality-1 FROM jsonb_array_elements(payload) WITH ORDINALITY LOOP
    IF jsonb_typeof(l) IS DISTINCT FROM 'object' OR jsonb_typeof(l->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(l->'name') IS DISTINCT FROM 'string'
      OR jsonb_typeof(l->'description') IS DISTINCT FROM 'string'
      OR jsonb_typeof(l->'items') IS DISTINCT FROM 'array'
      OR (l->>'id')=ANY(used_ids) THEN
      RAISE EXCEPTION 'Invalid list' USING ERRCODE='22023';
    END IF;
    used_ids := array_append(used_ids,l->>'id'); list_ids := array_append(list_ids,l->>'id');
    INSERT INTO public.listas_lists(user_id,id,name,description,position)
      VALUES(u,l->>'id',btrim(l->>'name'),l->>'description',lp)
      ON CONFLICT (user_id,id) DO UPDATE SET name=excluded.name,description=excluded.description,
        position=excluded.position,updated_at=CASE WHEN
          (listas_lists.name,listas_lists.description,listas_lists.position) IS DISTINCT FROM
          (excluded.name,excluded.description,excluded.position) THEN now() ELSE listas_lists.updated_at END;
    FOR i,ip IN SELECT value,ordinality-1 FROM jsonb_array_elements(l->'items') WITH ORDINALITY LOOP
      IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR jsonb_typeof(i->'id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(i->'title') IS DISTINCT FROM 'string'
        OR jsonb_typeof(i->'description') IS DISTINCT FROM 'string'
        OR jsonb_typeof(i->'images') IS DISTINCT FROM 'array'
        OR jsonb_array_length(i->'images')>5 OR (i->>'id')=ANY(used_ids) THEN
        RAISE EXCEPTION 'Invalid item' USING ERRCODE='22023';
      END IF;
      used_ids := array_append(used_ids,i->>'id'); item_ids := array_append(item_ids,i->>'id');
      INSERT INTO public.listas_items(user_id,id,list_id,title,description,position)
        VALUES(u,i->>'id',l->>'id',btrim(i->>'title'),i->>'description',ip)
        ON CONFLICT(user_id,id) DO UPDATE SET list_id=excluded.list_id,title=excluded.title,
          description=excluded.description,position=excluded.position,updated_at=CASE WHEN
          (listas_items.list_id,listas_items.title,listas_items.description,listas_items.position) IS DISTINCT FROM
          (excluded.list_id,excluded.title,excluded.description,excluded.position) THEN now() ELSE listas_items.updated_at END;
      FOR m,mp IN SELECT value,ordinality-1 FROM jsonb_array_elements(i->'images') WITH ORDINALITY LOOP
        IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR jsonb_typeof(m->'id') IS DISTINCT FROM 'string'
          OR jsonb_typeof(m->'name') IS DISTINCT FROM 'string'
          OR jsonb_typeof(m->'objectPath') IS DISTINCT FROM 'string'
          OR jsonb_typeof(m->'mimeType') IS DISTINCT FROM 'string'
          OR jsonb_typeof(m->'byteSize') IS DISTINCT FROM 'number'
          OR (m->>'id')=ANY(used_ids) THEN
          RAISE EXCEPTION 'Invalid image' USING ERRCODE='22023';
        END IF;
        used_ids := array_append(used_ids,m->>'id'); image_ids := array_append(image_ids,m->>'id');
        -- Lock Storage metadata until commit. No references to an absent/unowned upload.
        PERFORM 1 FROM storage.objects o WHERE o.bucket_id='listas-images'
          AND o.name=m->>'objectPath' AND split_part(o.name,'/',1)=u::text
          AND o.metadata->>'mimetype'=m->>'mimeType'
          AND (o.metadata->>'size')::bigint=(m->>'byteSize')::bigint FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Image upload not found' USING ERRCODE='22023'; END IF;
        INSERT INTO public.listas_images(user_id,id,item_id,name,position,object_path,mime_type,byte_size)
          VALUES(u,m->>'id',i->>'id',m->>'name',mp,m->>'objectPath',m->>'mimeType',(m->>'byteSize')::integer)
          ON CONFLICT(user_id,id) DO UPDATE SET item_id=excluded.item_id,name=excluded.name,position=excluded.position,
            object_path=excluded.object_path,mime_type=excluded.mime_type,byte_size=excluded.byte_size;
      END LOOP;
    END LOOP;
  END LOOP;
  DELETE FROM public.listas_images WHERE user_id=u AND NOT(id=ANY(image_ids));
  DELETE FROM public.listas_items WHERE user_id=u AND NOT(id=ANY(item_ids));
  DELETE FROM public.listas_lists WHERE user_id=u AND NOT(id=ANY(list_ids));
  revision_next := gen_random_uuid()::text;
  UPDATE public.listas_accounts SET revision=revision_next,updated_at=now() WHERE user_id=u;
  IF p_import_key IS NOT NULL THEN
    INSERT INTO public.listas_imports(user_id,import_key) VALUES(u,p_import_key);
  END IF;
  RETURN public.listas_read_v1();
END $$;

CREATE FUNCTION public.listas_object_deletable_v1(p_path text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL OR split_part(p_path,'/',1) IS DISTINCT FROM u::text THEN RETURN false; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('listas:'||u::text,0));
  RETURN NOT EXISTS(SELECT 1 FROM public.listas_images WHERE user_id=u AND object_path=p_path);
END $$;
REVOKE ALL ON FUNCTION public.listas_read_v1(),public.listas_commit_v1(uuid,text,jsonb,text),
  public.listas_object_deletable_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listas_read_v1(),public.listas_commit_v1(uuid,text,jsonb,text),
  public.listas_object_deletable_v1(text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('listas-images','listas-images',false,10485760,ARRAY['image/jpeg','image/png','image/webp']);
CREATE POLICY listas_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='listas-images' AND split_part(name,'/',1)=(SELECT auth.uid())::text);
CREATE POLICY listas_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='listas-images' AND name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}$'
    AND split_part(name,'/',1)=(SELECT auth.uid())::text);
-- No UPDATE policy: confirmed objects are immutable. Only unreferenced objects may be removed.
CREATE POLICY listas_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='listas-images' AND public.listas_object_deletable_v1(name));
NOTIFY pgrst, 'reload schema';
COMMIT;
