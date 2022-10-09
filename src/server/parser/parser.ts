import {Ok, Err, Result} from 'ts-results'
import {Position, TextDocument} from 'vscode-languageserver-textdocument'
import {ASTBool, ASTCharLit, ASTFloat, ASTInt, ASTNull, ASTStringLit} from '../ast/literals'
import {ASTComment, ASTIntType, ASTNode} from '../ast/types'
import {Tokeniser} from './tokeniser'
import {Token, TokenType} from './types'

function isInt(token: Token): boolean
{
	return token.typeIsOneOf(
		TokenType.binLit,
		TokenType.octLit,
		TokenType.hexLit,
		TokenType.intLit
	)
}

type ParsingErrors = 'UnreachableState' | 'IncorrectToken'

function isResultValid(result: Result<ASTNode | undefined, ParsingErrors>)
{
	return result.ok && result.val != undefined
}

function isResultDefined(result: Result<ASTNode | undefined, ParsingErrors>)
{
	return isResultValid(result) || !result.ok
}

function *yieldTokens(node: Result<ASTNode | undefined, ParsingErrors>)
{
	if (node.ok)
	{
		const astNode = node.val
		if (astNode)
			yield *astNode.yieldTokens()
	}
	return isResultValid(node)
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

	match(...tokenTypes: TokenType[]): ASTNode[] | undefined
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(...tokenTypes))
		{
			this.lexer.next()
			return this.skipWhite()
		}
		//expected(tokenType, token)
		return
	}

	skipWhite(): ASTNode[]
	{
		const comments = new Array<ASTNode>()
		const token = this.lexer.token
		while (token.typeIsOneOf(TokenType.whitespace, TokenType.newline, TokenType.comment))
		{
			if (token.typeIsOneOf(TokenType.comment))
				comments.push(new ASTComment(token))
			this.lexer.next()
		}
		return comments
	}

	*parseIdentStr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.ident))
			return false
		yield token
		const comments = this.match(TokenType.ident)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		return !!comments
	}

	*parseIdent(): Generator<Token, boolean, undefined>
	{
		const ident = yield *this.parseIdentStr()
		if (!ident)
			return false
		// Do symbol table things.
		return true
	}

	parseBin(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTInt(ASTIntType.bin, this.lexer.token)
		const match = this.match(TokenType.binLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseOct(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTInt(ASTIntType.oct, this.lexer.token)
		const match = this.match(TokenType.octLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseHex(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTInt(ASTIntType.hex, this.lexer.token)
		const match = this.match(TokenType.hexLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseInt(allowFloat = true): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.binLit))
			return this.parseBin()
		else if (token.typeIsOneOf(TokenType.octLit))
			return this.parseOct()
		else if (token.typeIsOneOf(TokenType.hexLit))
			return this.parseHex()
		else if (token.typeIsOneOf(TokenType.intLit))
		{
			const node = new ASTInt(ASTIntType.dec, this.lexer.token)
			this.lexer.next()
			if (allowFloat && token.typeIsOneOf(TokenType.dot))
				return Ok(this.parseFloat(node.token.value, node.token.location.start))
			node.add(this.skipWhite())
			return Ok(node)
		}
		return Ok(undefined)
	}

	parseFloat(intValue: string, tokenStart: Position): ASTNode
	{
		let decValue = ''
		let suffix = ''
		let floatBits = 64
		const token = this.lexer.token
		let tokenEnd = token.location.end
		this.lexer.next()
		if (token.typeIsOneOf(TokenType.intLit))
		{
			decValue = token.value
			tokenEnd = token.location.end
			this.lexer.next()
		}
		if (token.typeIsOneOf(TokenType.ident) && ['f', 'F'].includes(token.value))
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
		const node = new ASTFloat(floatBits, floatToken)
		node.add(this.skipWhite())
		return node
	}

	parseStringLiteral(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.stringLit))
			return Ok(undefined)
		const node = new ASTStringLit(token)
		while (token.typeIsOneOf(TokenType.stringLit))
		{
			node.addSegment(token)
			const match = this.match(TokenType.stringLit)
			if (!match)
				return Err('UnreachableState')
			node.add(match)
		}
		return Ok(node)
	}

	parseCharLiteral(): Result<ASTNode, ParsingErrors>
	{
		const node = new ASTCharLit(this.lexer.token)
		const match = this.match(TokenType.charLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseBool(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.boolLit))
			return Ok(undefined)
		const node = new ASTBool(token)
		const match = this.match(TokenType.boolLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseNull(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.nullptrLit))
			return Ok(undefined)
		const node = new ASTNull(token)
		const match = this.match(TokenType.nullptrLit)
		if (!match)
			return Err('UnreachableState')
		node.add(match)
		return Ok(node)
	}

	parseConst(): Result<ASTNode | undefined, ParsingErrors>
	{
		const token = this.lexer.token
		if (token.typeIsOneOf(TokenType.invalid))
		{
			console.error('Contant expected, got invalid token instead')
			return Err('IncorrectToken')
		}
		else if (isInt(token))
			return this.parseInt()
		else if (token.typeIsOneOf(TokenType.stringLit))
			return this.parseStringLiteral()
		else if (token.typeIsOneOf(TokenType.charLit))
			return this.parseCharLiteral()
		const bool = this.parseBool()
		if (isResultDefined(bool))
			return bool
		return this.parseNull()
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
		if (yield *yieldTokens(this.parseConst()))
			return true
		const ident = yield *this.parseIdent()
		//if (ident)
		//{
		//}
		return ident
	}

	*parseRelExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		const lhs = yield *this.parseValue()
		if (lhs && token.typeIsOneOf(TokenType.relOp, TokenType.equOp))
		{
			const comments = this.match(TokenType.relOp, TokenType.equOp)
			if (!comments)
				return false
			for (const comment of comments)
				yield *comment.yieldTokens()
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
			if (!token.typeIsOneOf(TokenType.logicOp))
				break
			const comments = this.match(TokenType.logicOp)
			if (comments)
			{
				for (const comment of comments)
					yield *comment.yieldTokens()
			}
			lhs = yield *this.parseRelation()
		}
		return true
	}

	*parseExpression(): Generator<Token, boolean, undefined>
	{
		// XXX: This needs to be restructured as a process that deals with ASTNodes instead of nested generators.
		const expr = yield *(function *(self): Generator<Token, boolean, undefined>
		{
			//const token = this.lexer.token
			const expr = yield *self.parseValue()
			return expr
		})(this)
		const token = this.lexer.token
		if (expr && token.typeIsOneOf(TokenType.semi))
		{
			const comments = this.match(TokenType.semi)
			if (comments)
			{
				for (const comment of comments)
					yield *comment.yieldTokens()
			}
		}
		return expr
	}

	*parseIfExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.ifStmt))
			return false
		yield token
		const comments = this.match(TokenType.ifStmt)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		const cond = yield *this.parseLogicExpr()
		if (!cond)
			return false
		return yield *this.parseBlock()
	}

	*parseElifExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.elifStmt))
			return false
		yield token
		const comments = this.match(TokenType.elifStmt)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		return !!comments
	}

	*parseElseExpr(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.elseStmt))
			return false
		yield token
		const comments = this.match(TokenType.elseStmt)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
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
		if (!token.typeIsOneOf(TokenType.visibility))
			return false
		yield token
		let comments = this.match(TokenType.visibility)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		comments = this.match(TokenType.semi)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		return !!comments
	}

	*parseBraceBlock(): Generator<Token, boolean, undefined>
	{
		const token = this.lexer.token
		if (!token.typeIsOneOf(TokenType.leftBrace))
			return yield *this.parseStatement()
		let comments = this.match(TokenType.leftBrace)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		while (!token.typeIsOneOf(TokenType.rightBrace))
		{
			const stmt = yield *this.parseStatement()
			if (!stmt)
				return false
		}
		comments = this.match(TokenType.rightBrace)
		if (comments)
		{
			for (const comment of comments)
				yield *comment.yieldTokens()
		}
		return !!comments
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
		const comments = this.skipWhite()
		for (const comment of comments)
			yield *comment.yieldTokens()
		while (!token.typeIsOneOf(TokenType.eof))
		{
			const stmt = yield *this.parseExtStatement()
			if (!stmt)
				this.lexer.next()
				//break
		}
	}
}
