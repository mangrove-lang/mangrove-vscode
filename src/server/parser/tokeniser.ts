import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {Token, TokenType} from './types'
import {isNewLine} from './recogniser'

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
		if (this.position.line + 1 == this.file.lineCount)
		{
			const offset = this.file.offsetAt({line: this.position.line, character: this.position.character + 1})
			const position = this.file.positionAt(offset)
			if (this.position.line == position.line && this.position.character == position.character)
			{
				this.eof = true
				this.currentChar = ''
				return
			}
		}

		const offset = this.file.offsetAt({line: this.position.line, character: this.position.character + 1})
		const position = this.file.positionAt(offset)
		this.currentChar = this.file.getText({start: this.position, end: position})
		this.position = position
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
}
