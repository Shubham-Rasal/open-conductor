-- name: GetUser :one
SELECT * FROM users WHERE id = ?;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = ?;

-- name: CreateUser :one
INSERT INTO users (id, email, name, password_hash)
VALUES (?, ?, ?, ?)
RETURNING *;

-- name: UpsertGuestUser :one
INSERT INTO users (id, email, name, password_hash)
VALUES ('00000000-0000-4000-8000-000000000001', 'guest@local', 'Guest', '')
ON CONFLICT (email) DO UPDATE SET name = excluded.name
RETURNING *;
