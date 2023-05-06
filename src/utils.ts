export function isBoolean (o:unknown) { //是否boolean
    return Object.prototype.toString.call(o).slice(8, -1) === 'Boolean';
}

export function isFunction (o:unknown) { //是否函数
    return Object.prototype.toString.call(o).slice(8, -1) === 'Function';
}

export function isNull (o:unknown) { //是否为null
    return Object.prototype.toString.call(o).slice(8, -1) === 'Null';
}

export function isUndefined (o:unknown) { //是否undefined
    return Object.prototype.toString.call(o).slice(8, -1) === 'Undefined';
}

export function isObj (o:unknown) { //是否对象
    return Object.prototype.toString.call(o).slice(8, -1) === 'Object';
}

export function isArray (o:unknown) { //是否数组
    return Object.prototype.toString.call(o).slice(8, -1) === 'Array';
}

export function isDate (o:unknown) { //是否时间
    return Object.prototype.toString.call(o).slice(8, -1) === 'Date';
}

export function isRegExp (o:unknown) { //是否正则
    return Object.prototype.toString.call(o).slice(8, -1) === 'RegExp';
}

export function isError (o:unknown) { //是否错误对象
    return Object.prototype.toString.call(o).slice(8, -1) === 'Error';
}

export function isSymbol (o:unknown) { //是否Symbol函数
    return Object.prototype.toString.call(o).slice(8, -1) === 'Symbol';

}

export function isPromise (o:unknown) { //是否Promise对象
    return Object.prototype.toString.call(o).slice(8, -1) === 'Promise';
}

export function isSet (o:unknown) { //是否Set对象
    return Object.prototype.toString.call(o).slice(8, -1) === 'Set';
}

export function isString (o:unknown) { //是否string
    return Object.prototype.toString.call(o).slice(8, -1) === 'String';
}

export function isNumber (o:unknown) { //是否number
    return Object.prototype.toString.call(o).slice(8, -1) === 'Number';
}