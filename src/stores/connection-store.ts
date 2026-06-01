import { create } from "zustand";
import type { ConnectionRecord, SchemaInfo, TableInfo, SchemaContext, DatabaseInfo } from "@/lib/tauri";

interface ConnectionData {
  databases: DatabaseInfo[];
  activeDatabase: string | null;
  schemas: SchemaInfo[];
  tables: Record<string, TableInfo[]>;
  schemaContext: SchemaContext | null;
}

interface ConnectionState {
  connections: ConnectionRecord[];
  activeConnectionId: string | null;
  connectedIds: string[];
  connectionData: Record<string, ConnectionData>;
  pendingSql: string | null;
  pendingSqlAutoRun: boolean;

  // Convenience getters
  readonly isConnected: boolean;

  setConnections: (connections: ConnectionRecord[]) => void;
  setActiveConnection: (id: string | null) => void;
  connectTo: (id: string) => void;
  disconnectFrom: (id: string) => void;
  isConnectedTo: (id: string) => boolean;
  setDatabases: (databases: DatabaseInfo[]) => void;
  setActiveDatabase: (db: string | null) => void;
  setSchemas: (schemas: SchemaInfo[]) => void;
  setTables: (schema: string, tables: TableInfo[]) => void;
  setSchemaContext: (ctx: SchemaContext) => void;
  setPendingSql: (sql: string | null, autoRun?: boolean) => void;
  reset: () => void;

  // Per-connection data setters
  setConnectionDatabases: (connId: string, databases: DatabaseInfo[]) => void;
  setConnectionActiveDatabase: (connId: string, db: string | null) => void;
  setConnectionSchemas: (connId: string, schemas: SchemaInfo[]) => void;
  setConnectionTables: (connId: string, schema: string, tables: TableInfo[]) => void;
  setConnectionSchemaContext: (connId: string, ctx: SchemaContext) => void;
}

const emptyConnectionData = (): ConnectionData => ({
  databases: [],
  activeDatabase: null,
  schemas: [],
  tables: {},
  schemaContext: null,
});

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  connectedIds: [],
  connectionData: {},
  pendingSql: null,
  pendingSqlAutoRun: false,

  get isConnected() {
    const state = get();
    return state.connectedIds.length > 0 && state.activeConnectionId != null;
  },

  setConnections: (connections) => set({ connections }),
  setActiveConnection: (id) => set({ activeConnectionId: id }),

  connectTo: (id) =>
    set((state) => {
      const alreadyConnected = state.connectedIds.includes(id);
      return {
        connectedIds: alreadyConnected ? state.connectedIds : [...state.connectedIds, id],
        activeConnectionId: id,
        connectionData: alreadyConnected
          ? state.connectionData
          : { ...state.connectionData, [id]: emptyConnectionData() },
      };
    }),

  disconnectFrom: (id) =>
    set((state) => {
      const newConnectedIds = state.connectedIds.filter((cid) => cid !== id);
      const newData = { ...state.connectionData };
      delete newData[id];
      const newActive =
        state.activeConnectionId === id
          ? newConnectedIds.length > 0
            ? newConnectedIds[0]
            : null
          : state.activeConnectionId;
      return {
        connectedIds: newConnectedIds,
        connectionData: newData,
        activeConnectionId: newActive,
      };
    }),

  isConnectedTo: (id) => get().connectedIds.includes(id),

  // Active-connection convenience setters (write to connectionData[activeConnectionId])
  setDatabases: (databases) =>
    set((state) => {
      const id = state.activeConnectionId;
      if (!id || !state.connectionData[id]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [id]: { ...state.connectionData[id], databases },
        },
      };
    }),

  setActiveDatabase: (db) =>
    set((state) => {
      const id = state.activeConnectionId;
      if (!id || !state.connectionData[id]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [id]: { ...state.connectionData[id], activeDatabase: db },
        },
      };
    }),

  setSchemas: (schemas) =>
    set((state) => {
      const id = state.activeConnectionId;
      if (!id || !state.connectionData[id]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [id]: { ...state.connectionData[id], schemas },
        },
      };
    }),

  setTables: (schema, tables) =>
    set((state) => {
      const id = state.activeConnectionId;
      if (!id || !state.connectionData[id]) return {};
      const connData = state.connectionData[id];
      return {
        connectionData: {
          ...state.connectionData,
          [id]: { ...connData, tables: { ...connData.tables, [schema]: tables } },
        },
      };
    }),

  setSchemaContext: (ctx) =>
    set((state) => {
      const id = state.activeConnectionId;
      if (!id || !state.connectionData[id]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [id]: { ...state.connectionData[id], schemaContext: ctx },
        },
      };
    }),

  setPendingSql: (sql, autoRun) => set({ pendingSql: sql, pendingSqlAutoRun: !!autoRun }),

  reset: () =>
    set({
      activeConnectionId: null,
      connectedIds: [],
      connectionData: {},
      pendingSql: null,
      pendingSqlAutoRun: false,
    }),

  // Per-connection data setters (explicit connection ID)
  setConnectionDatabases: (connId, databases) =>
    set((state) => {
      if (!state.connectionData[connId]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [connId]: { ...state.connectionData[connId], databases },
        },
      };
    }),

  setConnectionActiveDatabase: (connId, db) =>
    set((state) => {
      if (!state.connectionData[connId]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [connId]: { ...state.connectionData[connId], activeDatabase: db },
        },
      };
    }),

  setConnectionSchemas: (connId, schemas) =>
    set((state) => {
      if (!state.connectionData[connId]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [connId]: { ...state.connectionData[connId], schemas },
        },
      };
    }),

  setConnectionTables: (connId, schema, tables) =>
    set((state) => {
      if (!state.connectionData[connId]) return {};
      const connData = state.connectionData[connId];
      return {
        connectionData: {
          ...state.connectionData,
          [connId]: { ...connData, tables: { ...connData.tables, [schema]: tables } },
        },
      };
    }),

  setConnectionSchemaContext: (connId, ctx) =>
    set((state) => {
      if (!state.connectionData[connId]) return {};
      return {
        connectionData: {
          ...state.connectionData,
          [connId]: { ...state.connectionData[connId], schemaContext: ctx },
        },
      };
    }),
}));

// Selector hooks for active connection data
export function useActiveConnectionData() {
  return useConnectionStore((state) => {
    const id = state.activeConnectionId;
    if (!id) return null;
    return state.connectionData[id] ?? null;
  });
}

export function useActiveDatabases() {
  return useConnectionStore((state) => {
    const id = state.activeConnectionId;
    if (!id) return [];
    return state.connectionData[id]?.databases ?? [];
  });
}

export function useActiveDatabase() {
  return useConnectionStore((state) => {
    const id = state.activeConnectionId;
    if (!id) return null;
    return state.connectionData[id]?.activeDatabase ?? null;
  });
}

export function useActiveSchemas() {
  return useConnectionStore((state) => {
    const id = state.activeConnectionId;
    if (!id) return [];
    return state.connectionData[id]?.schemas ?? [];
  });
}

export function useActiveTables() {
  return useConnectionStore((state) => {
    const id = state.activeConnectionId;
    if (!id) return {};
    return state.connectionData[id]?.tables ?? {};
  });
}

export function useActiveSchemaContext() {
  return useConnectionStore((state) => {
    const id = state.activeConnectionId;
    if (!id) return null;
    return state.connectionData[id]?.schemaContext ?? null;
  });
}

export function useIsConnected() {
  return useConnectionStore((state) =>
    state.connectedIds.length > 0 && state.activeConnectionId != null
  );
}
