# P140 資料庫適用性

V0.012 使用靜態 data/bus_network.json，無 Supabase、Auth、PostgreSQL 資料表、RPC、Storage 或 migration。本版 database/ 無需執行 SQL，也不改動任何共用資料庫。

SDS v3.4 的資料庫項目標記為不適用並附原因；不以靜態 JSON 的 fetch 當作直接呼叫 Table/View API。未來加入資料庫時，須先完成 P140 命名空間、RLS、逐表 grants、RPC-only schema 邊界、權限及拒絕案例測試；帳號維護由 P130 處理。
