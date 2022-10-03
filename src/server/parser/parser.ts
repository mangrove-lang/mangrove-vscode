import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {Tokeniser} from './tokeniser'
import {Token, TokenType} from './types'

function isInt(token: Token): boolean
{
	return token.typeIs(
		TokenType.binLit,
		TokenType.octLit,
		TokenType.hexLit,
		TokenType.intLit
	)
}

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

	*parseIdentStr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.ident))
			return false
		yield token
		yield *this.match(TokenType.ident)
		return true
	}

	*parseIdent(): Generator<Token, boolean, undefined>
	{
		const ident = yield *this.parseIdentStr()
		if (!ident)
			return false
		// Do symbol table things.
		return true
	}

	*parseBin(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		yield token
		return yield *this.match(TokenType.binLit);
	}

	*parseOct(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		yield token
		return yield *this.match(TokenType.octLit);
	}

	*parseHex(skip: boolean = true): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.hexLit))
			return false
		yield token
		this.lexer.next()
		if (skip)
			yield *this.skipWhite()
		return true
	}

	*parseInt(allowFloat: boolean = true): Generator<Token, boolean, undefined>
	{
		const intToken = this.lexer.token.clone()
		if (intToken.typeIs(TokenType.binLit))
			return yield *this.parseBin()
		else if (intToken.typeIs(TokenType.octLit))
			return yield *this.parseOct()
		else if (intToken.typeIs(TokenType.hexLit))
			return yield *this.parseHex()
		else if (intToken.typeIs(TokenType.intLit))
		{
			const token = this.lexer.token
			this.lexer.next()
			if (allowFloat && token.typeIs(TokenType.dot))
			{
				yield *this.parseFloat(intToken.value, intToken.location.start)
				return true
			}
			yield intToken
			yield *this.skipWhite()
			return true
		}
		return false
	}

	*parseFloat(intValue: string, tokenStart: Position): Generator<Token, void, undefined>
	{
		let decValue = ''
		let suffix = ''
		let floatBits = 64
		const token = this.lexer.token
		let tokenEnd = token.location.end
		this.lexer.next()
		if (token.typeIs(TokenType.intLit))
		{
			decValue = token.value
			tokenEnd = token.location.end
			this.lexer.next()
		}
		if (token.typeIs(TokenType.ident) && ['f', 'F'].includes(token.value))
		{
			floatBits = 32
			suffix = token.value
			tokenEnd = token.location.end
			this.lexer.next()
		}
		const floatToken = new Token()
		const floatValue = `${intValue}.${decValue}${suffix}`
		if (floatBits == 32)
			floatToken.set(TokenType.float32Lit, floatValue)
		else
			floatToken.set(TokenType.float64Lit, floatValue)
		floatToken.beginsAt(tokenStart)
		floatToken.endsAt(tokenEnd)
		floatToken.calcLength(this.lexer.file)
		yield floatToken
		yield *this.skipWhite()
	}

	*parseStringLiteral(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.stringLit))
			return false
		while (token.typeIs(TokenType.stringLit))
		{
			yield token
			yield *this.match(TokenType.stringLit)
		}
		return true
	}

	*parseConst(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (token.typeIs(TokenType.invalid))
		{
			console.error('Contant expected, got invalid token instead')
			return false
		}
		else if (isInt(token))
			return yield *this.parseInt();
		else if (token.typeIs(TokenType.stringLit))
			return yield *this.parseStringLiteral()
		return false
	}

	*parseValue(): Generator<Token, boolean, undefined>
	{
		//const token = this.lexer.token
		if (this.haveIdent)
		{
			yield this._ident
			this._ident.reset()
			return true
		}
		const const_ = yield *this.parseConst()
		if (const_)
			return true
		const ident = yield *this.parseIdent()
		if (ident)
		{
		}
		return ident
	}

	*parseRelExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		const lhs = yield *this.parseValue()
		if (lhs && token.typeIs(TokenType.relOp, TokenType.equOp))
		{
			if (!this.match(TokenType.relOp, TokenType.equOp))
				return false
			return yield *this.parseValue()
		}
		return lhs
	}

	*parseRelation(): Generator<Token, boolean, undefined>
	{
		const rel = yield *this.parseRelExpr()
		if (!rel)
			return false
		//
		return true
	}

	*parseLogicExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		let lhs = yield *this.parseRelation()
		if (!lhs)
			return false
		while (lhs)
		{
			if (!token.typeIs(TokenType.logicOp))
				break
			yield *this.match(TokenType.logicOp)
			lhs = yield *this.parseRelation()
		}
		return true
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
		const cond = yield *this.parseLogicExpr()
		if (!cond)
			return false
		return yield *this.parseBlock()
	}

	*parseElifExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIs(TokenType.elifStmt))
			return false
		yield token
		yield *this.match(TokenType.elifStmt)
		return true
	}

	*parseElseExpr(): Generator<Token, boolean, undefined>
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
		while (true)
		{
			const elifExpr = yield *this.parseElifExpr()
			if (!elifExpr)
				break
		}
		yield *this.parseElseExpr()
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
