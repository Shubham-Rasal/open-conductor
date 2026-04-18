package sqliteutil

import (
	"database/sql"
	"strings"

	_ "modernc.org/sqlite" // SQLite driver (pure Go, no CGO)
)

const defaultPragma = "_pragma=foreign_keys(1)&_journal_mode=WAL"

// Open opens SQLite with foreign keys + WAL. Pass DATABASE_URL like
// file:./data.db, file:data.db?mode=rwc, or a bare path such as ./open_conductor.db
func Open(dsn string) (*sql.DB, error) {
	dsn = normalizeSQLiteDSN(dsn)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)
	return db, nil
}

func normalizeSQLiteDSN(dsn string) string {
	if dsn == "" {
		return "file:open_conductor.db?" + defaultPragma
	}
	if strings.HasPrefix(dsn, "file:") {
		if strings.Contains(dsn, "?") {
			if !strings.Contains(dsn, "_pragma=foreign_keys") {
				return dsn + "&" + defaultPragma
			}
			return dsn
		}
		return dsn + "?" + defaultPragma
	}
	return "file:" + dsn + "?" + defaultPragma
}
