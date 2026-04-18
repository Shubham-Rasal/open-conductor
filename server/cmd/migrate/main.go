package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"

	"github.com/Shubham-Rasal/open-conductor/server/internal/sqliteutil"
)

func main() {
	_ = godotenv.Load()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required (e.g. file:./open_conductor.db)")
	}

	db, err := sqliteutil.Open(dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	var schemaSQL string
	if p := os.Getenv("SCHEMA_PATH"); p != "" {
		b, err := os.ReadFile(p)
		if err != nil {
			log.Fatalf("read schema %s: %v", p, err)
		}
		schemaSQL = string(b)
	} else {
		schemaSQL = embeddedSchema
	}

	if err := applySchema(db, schemaSQL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	fmt.Println("migrations applied successfully")
}

func applySchema(db *sql.DB, schema string) error {
	// Strip line comments starting with --
	var b strings.Builder
	for _, line := range strings.Split(schema, "\n") {
		trim := strings.TrimSpace(line)
		if trim == "" || strings.HasPrefix(trim, "--") {
			continue
		}
		b.WriteString(line)
		b.WriteByte('\n')
	}
	clean := b.String()

	for _, stmt := range strings.Split(clean, ";") {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("exec: %w\n---\n%s\n---", err, stmt)
		}
	}
	return nil
}
