import { emptySnapshot, listsStorageKey, snapshotSchema, type ListsSnapshot } from './model';

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export type ExclusiveLock = <T>(key: string, action: () => T) => Promise<T>;

const browserLock: ExclusiveLock = async (key, action) => {
  if (!navigator.locks) {
    throw new Error('Este navegador não oferece proteção para gravações entre abas. Use um navegador atualizado para salvar com segurança.');
  }
  return navigator.locks.request(key, { mode: 'exclusive' }, action);
};

export class LocalListsRepository {
  readonly key: string;

  constructor(
    readonly owner: string,
    private readonly getStorage: () => StoragePort = () => window.localStorage,
    private readonly exclusive: ExclusiveLock = browserLock,
  ) {
    if (!owner) throw new Error('Entre na sua conta para acessar suas listas locais.');
    this.key = listsStorageKey(owner);
  }

  load(): ListsSnapshot {
    let raw: string | null;
    try { raw = this.getStorage().getItem(this.key); }
    catch { throw new Error('O armazenamento deste navegador está bloqueado. Permita dados locais e tente novamente.'); }
    if (raw === null) return emptySnapshot(this.owner);
    try {
      const snapshot = snapshotSchema.parse(JSON.parse(raw));
      if (snapshot.owner !== this.owner) throw new Error('owner');
      return snapshot;
    } catch {
      throw new Error('Os dados locais não puderam ser lidos ou usam uma versão incompatível. O conteúdo original foi preservado. Não limpe os dados do site; tente novamente após verificar o navegador.');
    }
  }

  async commit(
    expectedRevision: string,
    change: (snapshot: ListsSnapshot) => void,
    isActive: () => boolean = () => true,
  ): Promise<ListsSnapshot> {
    return this.exclusive(this.key, () => {
      if (!isActive()) throw new Error('A conta ou a seção mudou. A operação foi cancelada.');
      const current = this.load();
      if (current.revision !== expectedRevision) {
        throw new Error('As listas foram alteradas em outra aba. Atualize as listas antes de salvar novamente; seu formulário foi mantido.');
      }
      // Work on a detached snapshot. A failed write must never confirm optimistic data.
      const next: ListsSnapshot = JSON.parse(JSON.stringify(current));
      change(next);
      next.revision = crypto.randomUUID();
      const validated = snapshotSchema.parse(next);
      if (validated.owner !== this.owner) throw new Error('Conta inválida.');
      try { this.getStorage().setItem(this.key, JSON.stringify(validated)); }
      catch (error) {
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
          throw new Error('O armazenamento local está cheio. Nada foi alterado. Remova imagens do formulário ou escolha arquivos menores e tente salvar novamente.');
        }
        throw new Error('Não foi possível gravar no armazenamento local. Nada foi alterado. Verifique as permissões do navegador e tente novamente.');
      }
      return validated;
    });
  }
}
