-- name: ListComments :many
SELECT * FROM comments
WHERE issue_id = ?
ORDER BY created_at ASC;

-- name: CreateComment :one
INSERT INTO comments (id, issue_id, author_id, author_type, content)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: DeleteComment :exec
DELETE FROM comments WHERE id = ?;
