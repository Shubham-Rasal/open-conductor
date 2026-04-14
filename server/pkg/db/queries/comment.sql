-- name: ListComments :many
SELECT * FROM comments
WHERE issue_id = $1
ORDER BY created_at ASC;

-- name: CreateComment :one
INSERT INTO comments (issue_id, author_id, author_type, content)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: DeleteComment :exec
DELETE FROM comments WHERE id = $1;
