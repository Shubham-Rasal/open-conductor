package handler

import (
	db "github.com/Shubham-Rasal/open-conductor/server/pkg/db/generated"
	"github.com/Shubham-Rasal/open-conductor/server/internal/service"
)

// Store is the shared dependency container passed to all handlers.
type Store struct {
	Q           *db.Queries
	TaskService *service.TaskService
}
