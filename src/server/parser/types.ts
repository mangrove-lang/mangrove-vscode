import {Position, Range, TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticTokenTypes} from '../../providers/semanticTokens'

export enum TokenType
{
	invalid,
	eof,
	whitespace,
	comment,
	newline,
	dot,
	semi,
	ident,
	leftParen,
	rightParen,
	leftBrace,
	rightBrace,
	leftSquare,
	rightSquare,
	comma,
	colon,
	binLit,
	octLit,
	hexLit,
	intLit,
	stringLit,
	charLit,
	boolLit,
	nullptrLit,
	invert,
	incOp,
	mulOp,
	addOp,
	shiftOp,
	bitOp,
	relOp,
	equOp,
	logicOp,

	locationSpec,
	storageSpec,
	type,
	assignOp,

	deleteStmt,
	newStmt,
	returnStmt,
	ifStmt,
	elifStmt,
	elseStmt,
	whileStmt,
	doStmt,

	noneType,
	arrow,
	classDef,
	functionDef,
	operatorDef,
	decorator,
	visibility
}

export class Token
{
	private _type: TokenType = TokenType.invalid
	private _value = ''
	private _location: Range = {start: {line: -1, character: -1}, end: {line: -1, character: -1}}
	private _length = 0

	get type()
	{
		return this._type
	}

	get value()
	{
		return this._value
	}

	set value(value: string)
	{
		this._value = value
	}

	get location()
	{
		return this._location
	}

	get length()
	{
		return this._length
	}

	get valid()
	{
		return this._type != TokenType.invalid
	}

	public set(type: TokenType, value?: string)
	{
		this._type = type
		this._value = value ? value : ''
	}

	public reset()
	{
		this._type = TokenType.invalid
		this._value = ''
		this._location.start = this._location.end
		this._length = 0
	}

	public beginsAt(position: Position)
	{
		this._location.start = position
	}

	public endsAt(position: Position)
	{
		this._location.end = position
	}

	public calcLength(file: TextDocument)
	{
		const beginOffset = file.offsetAt(this._location.start)
		const endOffset = file.offsetAt(this._location.end)
		this._length = endOffset - beginOffset
	}

	public typeIs(...types: TokenType[])
	{
		return types.some(type => this._type == type, this)
	}

	public toSemanticType(): SemanticTokenTypes
	{
		switch (this._type)
		{
		case TokenType.comment:
			return SemanticTokenTypes.comment
		case TokenType.stringLit:
			return SemanticTokenTypes.string
		//case TokenType.boolLit:
		case TokenType.deleteStmt:
		case TokenType.newStmt:
		case TokenType.returnStmt:
		case TokenType.ifStmt:
		case TokenType.elifStmt:
		case TokenType.elseStmt:
		case TokenType.whileStmt:
		case TokenType.doStmt:
		case TokenType.visibility:
			return SemanticTokenTypes.keyword
		}
		throw new Error('Unhandled token type, cannot convert to semantic type')
	}
}
