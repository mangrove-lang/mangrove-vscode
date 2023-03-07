// SPDX-License-Identifier: BSD-3-Clause
import {OkImpl as OkBase, ErrImpl as ErrBase} from 'ts-results'

function isResultDefined<T, E>(result: Result<T | undefined, E>): result is Result<T, E>
{
	return (result.ok && result.val !== undefined) || result.err
}

// T can be anything else except undefined
type NonUndefined<T> = T extends undefined ? never : T

interface ResultExtra<T, E>
{
	isValid(): this is Ok<NonUndefined<T>>
	isInvalid(): this is Ok<undefined>
	isDefined(): this is Result<T, E>
	isOk(): this is Ok<T>
	isErr(): this is Err<E>
}

export class OkImpl<T> extends OkBase<T> implements ResultExtra<T, never>
{
	isValid(): this is Ok<NonUndefined<T>>
	{
		return this.ok && this.val !== undefined
	}

	isInvalid(): this is Ok<undefined>
	{
		return this.ok && this.val === undefined
	}

	isDefined(): this is Result<NonUndefined<T>, never>
	{
		return isResultDefined<T, never>(this)
	}

	isErr(): this is Err<never>
	{
		// Ok is by definiton, never Err
		return false
	}

	isOk(): this is Ok<T>
	{
		// Ok is by definition, always Ok
		return true
	}
}

export class ErrImpl<E> extends ErrBase<E> implements ResultExtra<never, E>
{
	isValid(): this is Ok<never>
	{
		// Err Result is by definition, never valid
		return false
	}

	isInvalid(): this is Ok<undefined>
	{
		// Err Result is by definition, always invalid
		return true
	}

	isDefined(): this is Result<never, E>
	{
		return isResultDefined<never, E>(this)
	}

	isErr(): this is Err<E>
	{
		// Err is by defnition, always Err
		return true
	}

	isOk(): this is Ok<never>
	{
		// Err is by defnition, never Ok
		return false
	}
}

// This allows Ok to be callable
export const Ok = <T>(val: T): Ok<T> => new OkImpl<T>(val)
export type Ok<T> = OkImpl<T>

// This allows Err to be callable
export const Err = <E>(err: E): Err<E> => new ErrImpl<E>(err)
export type Err<T> = ErrImpl<T>

export type Result<T, E> = Ok<T> | Err<E>
