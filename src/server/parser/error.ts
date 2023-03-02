import {Token} from './types'

export type ParsingErrors = 'UnreachableState' | 'IncorrectToken' | 'OperatorWithNoRHS' | 'InvalidTokenSequence' |
	'MissingBlock' | 'MissingComma' | 'MissingValue' | 'MissingIndexOrSlice' | 'MissingRightBracket' |
	'MissingParams' | 'MissingType' | 'MissingReturnType' | 'MissingIdent' | 'MissingCond' | 'InvalidAssignment' |
	'SymbolAlreadyDefined'

export enum ErrorKind
{
	constantExpected,
	parsingFailed,
	incorrectToken,
	operatorWithNoRHS,
	invalidTokenSequence,
	missingBlock,
	missingComma,
	missingValue,
	missingIndexOrSlice,
	missingRightBracket,
	missingRightParen,
	missingParams,
	missingType,
	missingReturnType,
	missingIdent,
	missingCond,
	invalidAssignment,
	symbolAlreadyDefined,
}

export class SyntaxError
{
	private readonly _errorToken: Token
	private readonly _kind: ErrorKind
	private readonly _reason: string | undefined

	constructor(errorToken: Token, kind: ErrorKind, reason?: string)
	{
		this._errorToken = errorToken.clone()
		this._kind = kind
		this._reason = reason
	}

	get token() { return this._errorToken }
	get reason() { return this._reason ?? '' }

	toString()
	{
		const start = this.token.location.start
		const location = `${start.line + 1}:${start.character + 1}`
		return `Error while parsing ${this.token} at ${location}: ${this.kind} ${this.reason}`
	}

	get kind(): string
	{
		switch (this._kind)
		{
		case ErrorKind.constantExpected:
			return 'Constant expected, got invalid token instead'
		case ErrorKind.parsingFailed:
			return 'Parsing failure'
		case ErrorKind.incorrectToken:
			return 'Incorrect token at location'
		case ErrorKind.operatorWithNoRHS:
			return 'Operator given but has no right-hand side'
		case ErrorKind.invalidTokenSequence:
			return 'Encountered an invalid token sequence'
		case ErrorKind.missingBlock:
			return 'Missing block for'
		case ErrorKind.missingComma:
			return 'Missing comma in expression'
		case ErrorKind.missingValue:
			return 'Missing value for expression'
		case ErrorKind.missingIndexOrSlice:
			return 'Missing index or slice expression after opening "["'
		case ErrorKind.missingRightBracket:
			return 'Missing right bracket ("]") after expression'
		case ErrorKind.missingRightParen:
			return 'Missing right parenthesis (")") after expression'
		case ErrorKind.missingParams:
			return 'Missing parameters for parameter list or missing ")"'
		case ErrorKind.missingType:
			return 'Missing type for expression'
		case ErrorKind.missingReturnType:
			return 'Missing return type for function/operator definition'
		case ErrorKind.missingIdent:
			return 'Missing identifier in expression'
		case ErrorKind.missingCond:
			return 'Missing condition expression'
		case ErrorKind.invalidAssignment:
			return 'Expression constitutes an invalid assignment'
		case ErrorKind.symbolAlreadyDefined:
			return 'The symbol defined by the expression is already defined in the current scope'
		}
	}
}

export function toErrorKind(error: ParsingErrors): ErrorKind
{
	// TODO: handle UnreachableState better
	if (error === 'UnreachableState')
		return ErrorKind.parsingFailed
	if (error === 'IncorrectToken')
		return ErrorKind.incorrectToken
	if (error === 'OperatorWithNoRHS')
		return ErrorKind.operatorWithNoRHS
	if (error === 'InvalidTokenSequence')
		return ErrorKind.invalidTokenSequence
	if (error === 'MissingBlock')
		return ErrorKind.missingBlock
	if (error === 'MissingComma')
		return ErrorKind.missingComma
	if (error === 'MissingValue')
		return ErrorKind.missingValue
	if (error === 'MissingIndexOrSlice')
		return ErrorKind.missingIndexOrSlice
	if (error === 'MissingRightBracket')
		return ErrorKind.missingRightBracket
	if (error === 'MissingParams')
		return ErrorKind.missingParams
	if (error === 'MissingType')
		return ErrorKind.missingType
	if (error === 'MissingReturnType')
		return ErrorKind.missingReturnType
	if (error === 'MissingIdent')
		return ErrorKind.missingIdent
	if (error === 'MissingCond')
		return ErrorKind.missingCond
	if (error === 'InvalidAssignment')
		return ErrorKind.invalidAssignment
	if (error === 'SymbolAlreadyDefined')
		return ErrorKind.symbolAlreadyDefined
	return ErrorKind.parsingFailed
}
