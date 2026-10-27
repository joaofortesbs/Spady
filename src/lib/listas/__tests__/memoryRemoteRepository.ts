/** Test double only. Never imported by runtime components. */
import { LocalListsRepository } from '../localRepository';
import { emptySnapshot, type ListsSnapshot } from '../model';

const states = new Map<string, ListsSnapshot>();
const imports = new Set<string>();
export const remoteFailure = { next: null as Error | null };
export const remoteState = (owner: string) => JSON.parse(JSON.stringify(states.get(owner) ?? emptySnapshot(owner))) as ListsSnapshot;
export function changeRemote(owner: string, change: (snapshot: ListsSnapshot) => void) {
  const snapshot = remoteState(owner);
  change(snapshot); snapshot.revision = crypto.randomUUID(); states.set(owner, snapshot);
}
export function resetRemote() { states.clear(); imports.clear(); remoteFailure.next = null; }
export class MemoryRemoteRepository {
  constructor(readonly owner: string) {}
  async load() { return remoteState(this.owner); }
  async importLocal(remote: ListsSnapshot) {
    const local = new LocalListsRepository(this.owner).load();
    const key = `${this.owner}:${local.revision}`;
    if (local.lists.length && !imports.has(key)) {
      changeRemote(this.owner, snapshot => { snapshot.lists.push(...local.lists); });
      imports.add(key);
      return remoteState(this.owner);
    }
    return remote;
  }
  async commit(previous: ListsSnapshot, change: (snapshot: ListsSnapshot) => void, active: () => boolean) {
    if (remoteFailure.next) { const error = remoteFailure.next; remoteFailure.next = null; throw error; }
    if (!active()) throw new Error('Conta mudou');
    if (previous.revision !== remoteState(this.owner).revision) throw new Error('As listas mudaram em outra aba ou dispositivo. Atualize as listas.');
    changeRemote(this.owner, change);
    return remoteState(this.owner);
  }
  async cleanup() {}
}
