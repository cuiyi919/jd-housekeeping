export function validateRaw(raw: unknown): string;
export function createStore(adapter: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}): {
  load(): Promise<string | null>;
  save(raw: string): Promise<void>;
  replace(raw: string): Promise<void>;
  raw(): Promise<string | null>;
  recovery(): Promise<string | null>;
};
