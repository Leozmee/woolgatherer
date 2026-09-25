// Stub de React pour Node : les hooks s'exécutent tout de suite.
type Any = any
export const useMemo = (fn: Any) => fn()
export const useCallback = (fn: Any) => fn
export const useRef = (v: Any) => ({ current: v })
export const useEffect = () => {}
export const useLayoutEffect = () => {}
export const useState = (v: Any) => [typeof v === 'function' ? v() : v, () => {}]
export const useContext = () => null
export const createContext = (v: Any) => ({ Provider: null, default: v })
export const forwardRef = (f: Any) => f
export const memo = (f: Any) => f
export const Fragment = 'fragment'
export const Suspense = 'suspense'
export const jsx = () => null
export const jsxs = () => null
export const createElement = () => null
export default { useMemo, useCallback, useRef, useEffect, useState, createElement, Fragment }
