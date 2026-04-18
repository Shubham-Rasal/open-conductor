package main

import _ "embed"

//go:embed schema.sqlite.sql
var embeddedSchema string
