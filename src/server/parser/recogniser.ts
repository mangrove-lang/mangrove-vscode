export function isNewLine(c: string) { return c === '\n' || c === '\r' }
export function isWhiteSpace(c: string) { return c === ' ' || c === '\t' || isNewLine(c) }

export function isAlpha(c: string)
{
	return (c >= 'a' && c <= 'z') ||
		(c >= 'A' && c <= 'Z') ||
		(c >= '\u00C0' && c <= '\u2000') ||
		(c >= '\u2070' && c <= '\uD7FF') ||
		(c >= '\uE000' && c <= '\uFE4F') ||
		(c >= '\uFE70' && c <= '\uFEFF') ||
		(c >= '\u{00010000}' && c <= '\u{0002FA1F}')
}

export function isDigit(c: string) { return c >= '0' && c <= '9' }
export function isAlphaNum(c: string) { return isAlpha(c) || isDigit(c) }
export function isUnderscore(c: string) { return c === '_' }
export function isBeginBin(c: string) { return c === 'B' || c === 'b' }
export function isBeginHex(c: string) { return c === 'X' || c === 'x' }
export function isBin(c: string) { return c === '0' || c === '1' }
export function isOct(c: string) { return c >= '0' && c <= '7' }

export function isHex(c: string)
{
	return (c >= '0' && c <= '9') ||
		(c >= 'A' && c <= 'F') ||
		(c >= 'a' && c <= 'f')
}

export function isDot(c: string) { return c === '.' }

export function isNormalAlpha(c: string)
{
	return c === ' ' || c === '!' ||
		(c >= '#' && c <= '&') ||
		(c >= '(' && c <= '[') ||
		(c >= ']' && c <= '~') ||
		(c >= '\u0080' && c <= '\uD7FF') ||
		// This is broken up like this because JS Surrogate Pair handling is stupid (bad).
		(c >= '\uE000' && c <= '\uFFFF') ||
		(c >= '\u{00010000}' && c <= '\u{0010FFFF}')
}

export function isSingleQuote(c: string) { return c === '\'' }
export function isDoubleQuote(c: string) { return c === '"' }

export function isTrue(str: string) { return str === 'true' }
export function isFalse(str: string) { return str === 'false' }
export function isNull(str: string) { return str === 'nullptr' }

export function isFunctionDef(str: string) { return str === 'function' }

export function isEquals(c: string) { return c === '=' }


export function isEquality(c: string) { return c === '<' || c === '<=' || c === '>' || c === '>=' }
export function isRelation(c: string) { return isEquality(c) || c === '!=' || c === '==' }

export function isNew(str: string) { return str === 'new' }
export function isDelete(str: string) { return str === 'delete' }

export function isFrom(str: string) { return str === 'from' }
export function isImport(str: string) { return str === 'import' }

export function isReturn(str: string) { return str === 'return' }

export function isIfStmt(str: string) { return str === 'if' }
export function isElifStmt(str: string) { return str === 'elif' }
export function isElseStmt(str: string) { return str === 'else' }

export function isWhileStmt(str: string) { return str === 'while' }
export function isDoStmt(str: string) { return str === 'do' }

export function isClass(str: string) { return str === 'class' }
export function isOperatorDef(str: string) { return str === 'operator' }

export function isStatic(str: string) { return str === 'static' }
export function isVolatile(str: string) { return str === 'volatile' }
export function isLocationSpec(str: string) { return str === 'eeprom' || str === 'flash' || str === 'rom' }
export function isStorageSpec(str: string) { return str === 'const' || isVolatile(str) || isStatic(str) }

export function isNone(str: string) { return str === 'none' }
export function isArrow(str: string) { return str === '->' }
export function isVisibility(str: string) { return str === 'public' || str === 'private' || str === 'protected' }
