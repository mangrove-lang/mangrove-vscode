import {TextDocument} from 'vscode-languageserver-textdocument'
import {Tokeniser} from './tokeniser'
import {Token, TokenType} from './types'

export class Parser
{
	private lexer: Tokeniser

	constructor(file: TextDocument)
	{
		this.lexer = new Tokeniser(file)
	}

	*match(tokenType: TokenType): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (token.typeIs(tokenType))
		{
			this.lexer.next()
			yield *this.skipWhite()
			return true
		}
		//expected(tokenType, token)
		return false
	}

	*skipWhite(): Generator<Token, void, undefined>
	{
		const token = this.lexer.token
		while (token.typeIs(TokenType.whitespace, TokenType.newline, TokenType.comment))
		{
			if (token.typeIs(TokenType.comment))
				yield token
			this.lexer.next()
		}
	}

	*parseStringLiteral(): Generator<Token, void, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.stringLit))
			return
		while (token.typeIs(TokenType.stringLit))
		{
			yield token
			this.match(TokenType.stringLit)
		}
	}

	*parseConst(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (token.typeIs(TokenType.invalid))
			throw Error('Contant expected, got invalid token instead')
		else if (token.typeIs(TokenType.stringLit))
			yield *this.parseStringLiteral()
		else
		{
			return false
		}
		return true
	}

	*parseValue(): Generator<Token, boolean, undefined>
	{
		//const token = this.lexer.token
		//if (this.haveIdent())
		//	yield token
		//	return
		const const_ = yield *this.parseConst()
		if (const_)
			return true
		return false
	}

	*parseExpression(): Generator<Token, boolean, undefined>
	{
		const expr = yield *(function *(self): Generator<Token, boolean, undefined>
		{
			//const token = this.lexer.token
			const expr = yield *self.parseValue()
			return expr
		})(this)
		const token = this.lexer.token
		if (expr && token.typeIs(TokenType.semi))
			yield *this.match(TokenType.semi)
		return expr
	}

	*parseStatement(): Generator<Token, boolean, undefined>
	{
		return yield *this.parseExpression()
	}

	*parseExtStatement(): Generator<Token, boolean, undefined>
	{
		return yield *this.parseStatement()
	}

	public *tokenise(): Generator<Token, void, undefined>
	{
		const token = this.lexer.next()
		for (const token of this.skipWhite())
			yield token
		while (!token.typeIs(TokenType.eof))
		{
			const stmt = yield *this.parseExtStatement()
			if (!stmt)
				break
		}
	}
}
