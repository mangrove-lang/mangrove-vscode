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

	parseStatement()
	{
		//return this.parseExpression()
	}

	public *tokenise(): Generator<Token, void, undefined>
	{
		const token = this.lexer.next()
		for (const token of this.skipWhite())
			yield token
		while (!token.typeIs(TokenType.eof))
		{
			this.lexer.next()
		}
	}
}
