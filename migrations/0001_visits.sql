-- 기존 visits 테이블 제거 (이전 migration 잔재)
DROP TABLE IF EXISTS visits;

-- 일별 방문 카운터 — tb_ prefix + 표준 컬럼 (indate/inuser/moddate/moduser/delcheck)
CREATE TABLE IF NOT EXISTS tb_visit_stat (
  visit_date  TEXT    NOT NULL PRIMARY KEY,   -- 'YYYY-MM-DD' (KST)
  visit_cnt   INTEGER NOT NULL DEFAULT 0,
  indate      TEXT,                            -- 첫 row 생성 시각 (YYYY-MM-DD HH:MI:SS, KST)
  inuser      TEXT    DEFAULT 'system',
  moddate     TEXT,                            -- 마지막 update 시각
  moduser     TEXT    DEFAULT 'system',
  delcheck    TEXT    NOT NULL DEFAULT 'N'
);

CREATE INDEX IF NOT EXISTS idx_tb_visit_stat_date ON tb_visit_stat(visit_date DESC);
