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
		if (!this._token.valid)
			this._token.beginsAt(this.position)

		if (this.position.line == this.file.lineCount)
		{
			const offset = this.file.offsetAt({line: this.position.line, character: this.position.character + 1})
			const position = this.file.positionAt(offset)
			if (this.position == position)
			{
				this.eof = true
				this.currentChar = ''
			}
		}
		const offset = this.file.offsetAt({line: this.position.line, character: this.position.character + 1})
		let position = this.file.positionAt(offset)
		if (this.position == position)
			position = {line: this.position.line + 1, character: 0}

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
