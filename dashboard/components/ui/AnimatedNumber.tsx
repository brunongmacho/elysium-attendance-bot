/**
 * AnimatedNumber Component
 * Smooth number counting animations using react-countup
 */

'use client'

import CountUp from 'react-countup'

export interface AnimatedNumberProps {
  /**
   * The number to count to
   */
  value: number

  /**
   * Starting value
   * @default 0
   */
  start?: number

  /**
   * Duration in seconds
   * @default 1
   */
  duration?: number

  /**
   * Number of decimal places
   * @default 0
   */
  decimals?: number

  /**
   * Decimal separator
   * @default '.'
   */
  decimal?: string

  /**
   * Thousands separator
   * @default ','
   */
  separator?: string

  /**
   * Prefix string
   */
  prefix?: string

  /**
   * Suffix string
   */
  suffix?: string

  /**
   * Custom class name
   */
  className?: string

  /**
   * Use easing
   * @default true
   */
  useEasing?: boolean

  /**
   * Enable group separator
   * @default false
   */
  useGrouping?: boolean

  /**
   * Preserve value on reinit
   * @default true
   */
  preserveValue?: boolean

  /**
   * Callback when animation completes
   */
  onEnd?: () => void
}

/**
 * Animated number component
 */
export function AnimatedNumber({
  value,
  start = 0,
  duration = 1,
  decimals = 0,
  decimal = '.',
  separator = ',',
  prefix,
  suffix,
  className,
  useEasing = true,
  useGrouping = false,
  preserveValue = true,
  onEnd,
}: AnimatedNumberProps) {
  return (
    <CountUp
      start={start}
      end={value}
      duration={duration}
      decimals={decimals}
      decimal={decimal}
      separator={separator}
      prefix={prefix}
      suffix={suffix}
      className={className}
      useEasing={useEasing}
      useGrouping={useGrouping}
      preserveValue={preserveValue}
      onEnd={onEnd}
    />
  )
}
