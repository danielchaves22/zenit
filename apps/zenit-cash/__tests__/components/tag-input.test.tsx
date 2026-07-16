import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagInput, type TagSuggestion } from '@/components/ui/TagInput';
import { useState } from 'react';

function TagInputHarness({
  initialTags = [],
  suggestions = []
}: {
  initialTags?: string[];
  suggestions?: TagSuggestion[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const fetchSuggestions = vi.fn(async () => suggestions);

  return (
    <TagInput
      id="tags"
      label="Tags"
      value={tags}
      onChange={setTags}
      pendingValues={pendingTags}
      onPendingChange={setPendingTags}
      fetchSuggestions={fetchSuggestions}
    />
  );
}

describe('TagInput', () => {
  it('adds a pending tag when the user types a new tag and presses space', async () => {
    const user = userEvent.setup();

    render(<TagInputHarness />);

    await user.type(screen.getByLabelText('Tags'), 'viagem ');

    const chip = await screen.findByText('viagem');
    expect(chip.parentElement).toHaveClass('text-green-200');
  });

  it('removes the last chip with backspace when the input is empty', async () => {
    const user = userEvent.setup();

    render(<TagInputHarness initialTags={['mercado', 'cartao']} />);

    await user.click(screen.getByLabelText('Tags'));
    await user.keyboard('{Backspace}');

    expect(screen.getByText('mercado')).toBeInTheDocument();
    expect(screen.queryByText('cartao')).not.toBeInTheDocument();
  });

  it('adds an existing suggestion without marking it as pending', async () => {
    const user = userEvent.setup();

    render(
      <TagInputHarness
        suggestions={[
          {
            id: 1,
            name: 'mercado',
            usageCount: 4
          }
        ]}
      />
    );

    await user.type(screen.getByLabelText('Tags'), 'mer');
    await waitFor(() => expect(screen.getByText('mercado')).toBeInTheDocument());
    await user.click(screen.getByText('mercado'));

    const chip = await screen.findByText('mercado');
    expect(chip.parentElement).not.toHaveClass('text-green-200');
  });
});
