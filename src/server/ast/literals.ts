import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens';
import {Token} from '../parser/types';
import {ASTIntType, ASTNode, ASTNodeData, ASTType} from './types'
import {ASTValue} from './values';

export class ASTInt extends ASTNodeData implements ASTValue
{
	private _type: ASTIntType

	constructor(type: ASTIntType, token: Token)
	{
		super(token)
		this._type = type
	}

	get type() { return ASTType.intValue }
	get valid() { return this._token.valid }
	get semanticType() { return SemanticTokenTypes.number }
	toString() { return `<Int (${this._type}): ${this._token.value}>` }

	*semanticTokens(): Generator<SemanticToken, void, undefined>
	{
		yield this.buildSemanticToken(this.semanticType)
		for (const child of this.children)
			yield *child.semanticTokens()
	}
}
