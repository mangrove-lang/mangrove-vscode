import {TextDocument} from 'vscode-languageserver-textdocument'
import {Tokeniser} from './tokeniser'
import {Token, TokenType} from './types'

export class Parser
{
	private lexer: Tokeniser
	private _ident: Token

	constructor(file: TextDocument)
	{
		this.lexer = new Tokeniser(file)
		this._ident = new Token()
	}

	get haveIdent()
	{
		return this._ident.valid
	}

	*match(...tokenTypes: TokenType[]): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (token.typeIs(...tokenTypes))
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
		{
			console.error('Contant expected, got invalid token instead')
			return false
		}
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

	*parseIfExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.ifStmt))
			return false
		yield token
		yield *this.match(TokenType.ifStmt)
		return true
	}

	*parserElifExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.elifStmt))
			return false
		yield token
		yield *this.match(TokenType.elifStmt)
		return true
	}

	*parserElseExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.elseStmt))
			return false
		yield token
		yield *this.match(TokenType.elseStmt)
		return yield *this.parseBlock()
	}

	*parseIfStmt(): Generator<Token, boolean, undefined>
	{
		const ifExpr = yield *this.parseIfExpr()
		if (!ifExpr)
			return false
		//
		return true
	}

	*parseStatement(): Generator<Token, boolean, undefined>
	{
		let stmt = false
		if (!stmt)
			stmt = yield *this.parseIfStmt()
		if (!stmt)
			stmt = yield *this.parseExpression()
		return stmt
	}

	*parseVisibility(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.visibility))
			return false
		yield token
		yield *this.match(TokenType.visibility)
		return !(yield *this.match(TokenType.semi))
	}

	*parseBraceBlock(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.leftBrace))
			return yield *this.parseStatement()
		yield *this.match(TokenType.leftBrace)
		while (!token.typeIs(TokenType.rightBrace))
		{
			const stmt = yield *this.parseStatement()
			if (!stmt)
				return false
		}
		return yield *this.match(TokenType.rightBrace)
	}

	*parseBlock(): Generator<Token, boolean, undefined>
	{
		return yield *this.parseBraceBlock()
	}

	*parseExtStatement(): Generator<Token, boolean, undefined>
	{
		const stmt = yield *this.parseVisibility()
		if (!stmt)
			return yield *this.parseStatement()
		return stmt
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
				this.lexer.next()
				//break
		}
	}
}
