import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {Token, TokenType} from './types'
import {
	isNewLine,
	isAlpha,
	isDigit,
	isAlphaNum,
	isUnderscore,
	isBeginBin,
	isBeginHex,
	isBin,
	isOct,
	isHex,
	isNormalAlpha,
	isSingleQuote,
	isDoubleQuote,
	isTrue,
	isFalse,
	isNull,
	isEquals,
	isReturn,
	isIfStmt,
	isElifStmt,
	isElseStmt,
	isWhileStmt,
	isDoStmt,
	isVisibility
} from './recogniser'

export class Tokeniser
{
	private _file: TextDocument
	private currentChar: string
	private position: Position
	private eof: boolean
	private _token : Token

	constructor(file: TextDocument)
	{
		this._file = file
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

	get file()
	{
		return this._file
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

	finaliseToken(type?: TokenType, value?: string)
	{
		if (type)
			this._token.set(type, value)
		this._token.endsAt(this.position)
		this._token.calcLength(this.file)
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
			return
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
		case '~':
			this._token.set(TokenType.invert)
			break
		case '/':
			this.readDivToken()
			return
		case '*':
		case '%':
			this.readMulToken()
			return
		case '+':
		case '-':
			this.readAddToken()
			return
		case '&':
		case '|':
			this.readBooleanToken()
			return
		case '^':
			this.readBitwiseToken()
			return
		case '<':
		case '>':
			this.readRelationToken()
			return
		case '!':
		case '=':
			this.readEqualityToken()
			return
		default:
			this.readExtendedToken()
			return
		}
		this.finaliseToken()
		this.nextChar()
	}

	readExtendedToken()
	{
		this._token.set(TokenType.ident)
		if (isAlpha(this.currentChar) || isUnderscore(this.currentChar))
		{
			const token = this.readAlphaNumToken()
			if (token == '' || this.eof)
				return
			else if (isTrue(token) || isFalse(token))
				this._token.set(TokenType.boolLit, token)
			else if (isNull(token))
				this._token.set(TokenType.nullptrLit)
			else if (token == 'and')
				this._token.set(TokenType.logicOp, '&')
			else if (token == 'or')
				this._token.set(TokenType.logicOp, '|')
			else if (token == 'not')
				this._token.set(TokenType.invert, '!')

			else if (isReturn(token))
				this._token.set(TokenType.returnStmt)
			else if (isIfStmt(token))
				this._token.set(TokenType.ifStmt)
			else if (isElifStmt(token))
				this._token.set(TokenType.elifStmt)
			else if (isElseStmt(token))
				this._token.set(TokenType.elseStmt)
			else if (isWhileStmt(token))
				this._token.set(TokenType.whileStmt)
			else if (isDoStmt(token))
				this._token.set(TokenType.doStmt)

			else if (isVisibility(token))
				this._token.set(TokenType.visibility, token)
			else
				this._token.value = token
		}
		else if (isDigit(this.currentChar))
			this.readIntToken()
		else
		{
			this._token.set(TokenType.invalid)
			this.nextChar()
		}
	}

	readPartComment()
	{
		this._token.set(TokenType.comment)
		let foundEnd = false
		let comment = ''
		while (!foundEnd && !this.eof)
		{
			if (this.currentChar == '*')
			{
				const value = this.nextChar()
				if (this.currentChar as string == '/')
				{
					this.nextChar()
					foundEnd = true
				}
				else
					comment += value
			}
			else
				comment += this.nextChar()
		}
		this.finaliseToken(TokenType.comment, comment)
	}

	readLineComment()
	{
		this._token.set(TokenType.comment)
		let comment = ''
		while (!this.eof && !isNewLine(this.currentChar))
			comment += this.nextChar()
		this.finaliseToken(TokenType.comment, comment)
	}

	readBinToken()
	{
		let str = ''
		this._token.set(TokenType.binLit)
		this.nextChar()
		while (isBin(this.currentChar))
			str += this.nextChar()
		this._token.set(TokenType.binLit, str)
	}

	readOctToken()
	{
		let str = ''
		this._token.set(TokenType.octLit)
		this.nextChar()
		while (isOct(this.currentChar))
			str += this.nextChar()
		this._token.set(TokenType.octLit, str)
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

	readIntToken()
	{
		let str = ''
		this._token.set(TokenType.intLit)
		if (this.currentChar == '0')
		{
			str += this.nextChar()
			if (isBeginBin(this.currentChar))
				return this.readBinToken()
			else if (isBeginHex(this.currentChar))
				return this.readHexToken()
			else if (isOct(this.currentChar))
				return this.readOctToken()
		}

		while (isDigit(this.currentChar))
			str += this.nextChar()
		this._token.set(TokenType.intLit, str)
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

	readDivToken()
	{
		this._token.set(TokenType.mulOp)
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.nextChar()
			this.finaliseToken(TokenType.assignOp, token)
		}
		else if (this.currentChar == '*')
		{
			this.nextChar()
			this.readPartComment()
		}
		else if (this.currentChar == '/')
		{
			this.nextChar()
			this.readLineComment()
		}
		else
			this.finaliseToken(TokenType.mulOp, token)
	}

	readMulToken()
	{
		this.finaliseToken(TokenType.mulOp, this.currentChar)
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.currentChar
			this.finaliseToken(TokenType.assignOp, token)
			this.nextChar()
		}
	}

	readAddToken()
	{
		this.finaliseToken(TokenType.addOp, this.currentChar)
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.currentChar
			this.finaliseToken(TokenType.assignOp, token)
		}
		else if (token == '-' && this.currentChar == '>')
			this.finaliseToken(TokenType.arrow)
		else if (this.currentChar == token)
			this.finaliseToken(TokenType.incOp, this.currentChar)
		else
			return
		this.nextChar()
	}

	readBooleanToken()
	{
		this.finaliseToken(TokenType.bitOp, this.currentChar)
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.currentChar
			this.finaliseToken(TokenType.assignOp, token)
		}
		else if (this.currentChar == token)
			this.finaliseToken(TokenType.logicOp, token)
		else
			return
		this.nextChar()
	}

	readBitwiseToken()
	{
		this.finaliseToken(TokenType.bitOp, this.currentChar)
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.currentChar
			this.finaliseToken(TokenType.assignOp, token)
			this.nextChar()
		}
	}

	readRelationToken()
	{
		this.finaliseToken(TokenType.relOp, this.currentChar)
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.currentChar
			this.finaliseToken(TokenType.relOp, token)
		}
		else if (this.currentChar == token)
		{
			token += this.currentChar
			this.finaliseToken(TokenType.shiftOp, token)
			if (isEquals(this.currentChar))
			{
				token += this.currentChar
				this.finaliseToken(TokenType.assignOp, token)
			}
		}
		else
			return
		this.nextChar()
	}

	readEqualityToken()
	{
		this.finaliseToken()
		let token = this.nextChar()
		if (isEquals(this.currentChar))
		{
			token += this.currentChar
			this.finaliseToken(TokenType.equOp, token)
			this.nextChar()
		}
		else
		{
			if (isEquals(token))
				this._token.set(TokenType.assignOp, token)
			else
				this._token.set(TokenType.invert, token)
		}
	}

	readAlphaNumToken()
	{
		let token = ''
		while (isAlphaNum(this.currentChar) || isUnderscore(this.currentChar))
		{
			this.finaliseToken()
			token += this.nextChar()
		}
		return token
	}
}
