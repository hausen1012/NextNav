import { useCallback, useEffect, useRef, type PointerEvent } from 'react'

type LongPressPoint = { x: number; y: number }

// 触摸/触控笔长按时回调，移动超过阈值或抬起即取消；鼠标保留原生右键行为
export function useLongPress(
  onLongPress: (point: LongPressPoint) => void,
  delay = 700,
  moveThreshold = 10
) {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<LongPressPoint>({ x: 0, y: 0 })
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clear, [clear])

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return
      clear()
      firedRef.current = false
      startRef.current = { x: event.clientX, y: event.clientY }
      const { clientX: x, clientY: y } = event
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true
        onLongPress({ x, y })
      }, delay)
    },
    [clear, delay, onLongPress]
  )

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (
        Math.abs(event.clientX - startRef.current.x) > moveThreshold ||
        Math.abs(event.clientY - startRef.current.y) > moveThreshold
      ) {
        clear()
      }
    },
    [clear, moveThreshold]
  )

  const onPointerEnd = useCallback(() => clear(), [clear])

  const consumeLongPress = useCallback(() => {
    const fired = firedRef.current
    firedRef.current = false
    return fired
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
    consumeLongPress,
  }
}
