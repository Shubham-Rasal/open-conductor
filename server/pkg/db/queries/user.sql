-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: CreateUser :one
INSERT INTO users (email, name, password_hash)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpsertGuestUser :one
INSERT INTO users (email, name, password_hash)
VALUES ('guest@local', 'Guest', '')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
RETURNING *;
