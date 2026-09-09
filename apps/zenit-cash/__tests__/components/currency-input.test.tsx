import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CurrencyInput } from '@/components/ui/CurrencyInput'

function ControlledCurrencyInput() {
  const [value, setValue] = useState('132.45')

  return (
    <CurrencyInput
      id="amount"
      label="Valor"
      value={value}
      onChange={setValue}
    />
  )
}

describe('CurrencyInput', () => {
  it('replaces a fully selected value and keeps typing from right to left', async () => {
    const user = userEvent.setup()
    render(<ControlledCurrencyInput />)

    const input = screen.getByLabelText('Valor') as HTMLInputElement
    input.focus()
    input.select()

    await user.keyboard('1')

    expect(input).toHaveValue('0,01')
    await waitFor(() => {
      expect(input.selectionStart).toBe(input.value.length)
      expect(input.selectionEnd).toBe(input.value.length)
    })

    await user.keyboard('2345')

    expect(input).toHaveValue('123,45')
  })
})
