```ts
const AKclown = {
    isString: 'AKclown',
    isNumber: 20,
    isBoolean: true,
    isUndefined: undefined,
    isNull: null,
    isArray: [{ isString: 'JS Object To Typescript' }, 'AKclown', 1, 1, [1, 3, 'string'], true, undefined, null],
    isObject: {
        isString: 'AKclown',
        isNumber: 20,
        isBoolean: true,
        isUndefined: undefined,
        isNull: null,
        isArray: [{ title: 'JS Object To Typescript' }, 'AKclown', 1, [1, 3, 'string'], true, undefined, null]
    },
    isSymbol: Symbol(),
    isDate: new Date(),
    isRegExp: new RegExp('ab+c'),
    isError:new Error(),
    isPromise: new Promise(() =>{}),
}
```