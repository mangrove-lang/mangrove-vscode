import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {Token, TokenType} from './types'
import {isNewLine, isHex, isNormalAlpha, isDoubleQuote, isSingleQuote} from './recogniser'

export class Tokeniser
{
	private file: TextDocument
	private currentChar: string
	private position: Position
	private eof: boolean
	private _token : Token

	constructor(file: TextDocument)
	{
		this.file = file
		this.currentChar = ''
		this.position = {line: 0, character: 0}
		this.eof = false
		this._token = new Token()

		this._token.endsAt(this.position)
		this.nextChar()
	}

	get token()
	{
		return this._token
	}

	public next()
	{
		if (this.eof)
		{
			this._token.set(TokenType.eof)
			return this._token
		}
		this._token.reset()
		this.readToken()
		return this._token
	}

	nextChar()
	{
		const value = this.currentChar
		if (this.position.line + 1 == this.file.lineCount)
		{
			const offset = this.file.offsetAt({line: this.position.line, character: this.position.character + 1})
			const position = this.file.positionAt(offset)
			if (this.position.line == position.line && this.position.character == position.character)
			{
				this.eof = true
				this.currentChar = ''
				return value
			}
		}

		const offset = this.file.offsetAt({line: this.position.line, character: this.position.character + 1})
		const position = this.file.positionAt(offset)
		this.currentChar = this.file.getText({start: this.position, end: position})
		this.position = position
		return value
	}

	readToken()
	{
		switch (this.currentChar)
		{
		case ' ':
		case '\t':
			this._token.set(TokenType.whitespace)
			break
		case '#':
			this.readLineComment()
			break
		case '\r':
		case '\n':
			this._token.set(TokenType.whitespace)
			break
		case '.':
			this._token.set(TokenType.dot)
			break
		case ';':
			this._token.set(TokenType.semi)
			break
		case '{':
			this._token.set(TokenType.leftBrace)
			break
		case '}':
			this._token.set(TokenType.rightBrace)
			break
		case '(':
			this._token.set(TokenType.leftParen)
			break
		case ')':
			this._token.set(TokenType.rightParen)
			break
		case '[':
			this._token.set(TokenType.leftSquare)
			break
		case ']':
			this._token.set(TokenType.rightSquare)
			break
		case ',':
			this._token.set(TokenType.comma)
			break
		case ':':
			this._token.set(TokenType.colon)
			break
		case '"':
			this.readStringToken()
			break
		case '\'':
			this.readCharToken()
			break
		}
		this._token.endsAt(this.position)
		this._token.calcLength(this.file)
		this.nextChar()
	}

	readLineComment()
	{
		this._token.set(TokenType.comment)
		while (!this.eof && !isNewLine(this.currentChar))
			this.nextChar()
	}

	readHexToken()
	{
		let str = ''
		this._token.set(TokenType.hexLit)
		this.nextChar()
		while (isHex(this.currentChar))
			str += this.nextChar()
		this._token.set(TokenType.hexLit, str)
	}

	readUnicode(norm: string, esc: string): string
	{
		let result = ''
		if (isNormalAlpha(this.currentChar) || this.currentChar == norm)
			result = this.currentChar
		else if (this.currentChar == '\\')
		{
			this.nextChar()
			switch (this.currentChar as string)
			{
			case '\\':
				result = '\\'
				break
			case 'b':
				result = '\x08'
				break
			case 'r':
				result = '\x0D'
				break
			case 'n':
				result = '\x0A'
				break
			case 't':
				result = '\x09'
				break
			case 'v':
				result = '\x0B'
				break
			case 'f':
				result = '\x0C'
				break
			case 'a':
				result = '\x07'
				break
			case 'u':
			case 'U':
				this.readHexToken()
				return String.fromCodePoint(Number.parseInt(this._token.value, 16))
			}
			if (this.currentChar == esc)
			{
				this.nextChar()
				return esc
			}
		}
		if (!this.eof)
			this.nextChar()
		return result
	}

	readStringToken()
	{
		this._token.set(TokenType.stringLit)
		this.nextChar()
		let lit = ''
		while (!isDoubleQuote(this.currentChar))
		{
			const value = this.readUnicode('\'', '"')
			if (value == '')
			{
				this._token.set(TokenType.invalid)
				return
			}
			lit += value
		}
		this._token.value = lit
	}

	readCharToken()
	{
		this._token.set(TokenType.charLit)
		this.nextChar()
		const lit = this.readUnicode('"', '\'')
		if (lit == '' || !isSingleQuote(this.currentChar))
		{
			this._token.set(TokenType.invalid)
			return
		}
		this._token.value = lit
	}
}
