export function isNewLine(c: string) { return c == '\n' || c == '\r' }
export function isWhiteSpace(c: string) { return c == ' ' || c == '\t' || isNewLine(c) }


export function isHex(c: string)
{
	return (c >= '0' && c <= '9') ||
		(c >= 'A' && c <= 'F') ||
		(c >= 'a' && c <= 'f')
}

export function isDot(c: string) { return c == '.' }

export function isNormalAlpha(c: string)
{
	return c == ' ' || c == '!' ||
		(c >= '#' && c <= '&') ||
		(c >= '(' && c <= '[') ||
		(c >= ']' && c <= '~') ||
		(c >= '\u0080' && c <= '\uD7FF') ||
		(c >= '\uE000' && c <= '\u0010FFFF')
}

export function isSingleQuote(c: string) { return c == '\'' }
export function isDoubleQuote(c: string) { return c == '"' }
