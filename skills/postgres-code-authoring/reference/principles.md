# PostgreSQL code authoring principles

## Sources

- PostgreSQL Data Definition — https://www.postgresql.org/docs/current/ddl.html
- PostgreSQL Using EXPLAIN — https://www.postgresql.org/docs/current/using-explain.html

1. Schema integrity and migration safety outrank convenience.
2. Performance claims require a plan or measurement from the relevant dataset and version.
3. Authorship is not authorization to execute a data-changing statement.
