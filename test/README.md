# Mangrove vscode tests

## Tokeniser

Logic of tokeniser tests is in `test/server/parser/tokeniser.ts`.

Test cases are in `test/cases/tokenisation/`.

The `.case` syntax consist of multiple lines where each line has a valid
token sequence.

## Parser

Logic of tokeniser tests is in `test/server/parser/parser.ts`.

Test cases are in `test/cases/syntax/`.

Test cases for the parser are regular mangrove syntax.

If file consists of valid syntax that parser is unable to handle,
the file name should be prefixed with `fixme_`. Fixme files are ignored by the parser
tests.
