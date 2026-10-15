import * as React from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { cx } from './utils';

export type Visibility = 'public' | 'internal';

export interface ComposerSubmit {
  text: string;
  images: File[];
  visibility: Visibility;
}

export interface ComposerProps {
  placeholder?: string;
  /** Admins can switch a comment to an internal note. */
  canUseInternal?: boolean;
  /** Voice dictation is on in Settings. When false the mic is not rendered at all. */
  voiceEnabled?: boolean;
  /** Image attachments (admins in v1). */
  allowImages?: boolean;
  /** Called while recording is toggled; the app streams audio to /api/transcribe. */
  onDictationChange?: (recording: boolean) => void;
  onSubmit?: (value: ComposerSubmit) => void;
  className?: string;
}

const MAX_IMAGES = 3;
const MAX_BYTES = 5 * 1024 * 1024;

/** The prompt-box comment field on request pages. */
export function Composer({
  placeholder = 'Write a comment…',
  canUseInternal = false,
  voiceEnabled = false,
  allowImages = false,
  onDictationChange,
  onSubmit,
  className,
}: ComposerProps) {
  const [text, setText] = React.useState('');
  const [visibility, setVisibility] = React.useState<Visibility>('public');
  const [images, setImages] = React.useState<File[]>([]);
  const [previews, setPreviews] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const [recording, setRecording] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const fieldId = React.useId();

  React.useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const tooBig = picked.find((f) => f.size > MAX_BYTES);
    if (tooBig) setError(`${tooBig.name} is over 5 MB. Try a smaller screenshot.`);
    const ok = picked.filter((f) => f.size <= MAX_BYTES);
    const room = MAX_IMAGES - images.length;
    if (ok.length > room) setError(`You can attach up to ${MAX_IMAGES} images.`);
    setImages([...images, ...ok.slice(0, room)]);
  };

  const submit = () => {
    if (!text.trim()) return;
    onSubmit?.({ text: text.trim(), images, visibility });
    setText('');
    setImages([]);
    setError('');
  };

  const internal = visibility === 'internal';

  return (
    <form
      className={cx('lt-composer', internal && 'is-internal', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={fieldId} className="lt-sr">
        {internal ? 'Internal note' : 'Comment'}
      </label>
      {previews.length > 0 && (
        <div className="lt-thumbs">
          {previews.map((src, i) => (
            <span key={src} className="lt-thumb">
              <img src={src} alt={images[i]?.name ?? ''} />
              <button
                type="button"
                className="lt-thumb-x"
                aria-label={`Remove ${images[i]?.name ?? 'image'}`}
                onClick={() => setImages(images.filter((_, j) => j !== i))}
              >
                <Icon name="x" size={12} strokeWidth={3} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        id={fieldId}
        className="lt-composer-field"
        rows={2}
        value={text}
        placeholder={recording ? 'Listening…' : internal ? 'Leave a note only the team can see…' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {error && (
        <p className="lt-composer-error" role="alert">
          {error}
        </p>
      )}
      <div className="lt-composer-row">
        {allowImages && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              icon="photo"
              iconOnly
              aria-label={`Attach images (up to ${MAX_IMAGES})`}
              disabled={images.length >= MAX_IMAGES}
              onClick={() => fileRef.current?.click()}
            />
          </>
        )}
        {canUseInternal && (
          <button
            type="button"
            className="lt-visibility"
            aria-label={`Visibility: ${internal ? 'Internal' : 'Public'}. Switch to ${internal ? 'public' : 'internal'}`}
            onClick={() => setVisibility(internal ? 'public' : 'internal')}
          >
            <Icon name={internal ? 'lock' : 'globe'} size={15} />
            {internal ? 'Internal' : 'Public'}
            <Icon name="chevronDown" size={14} />
          </button>
        )}
        <span className="lt-grow" />
        {voiceEnabled && (
          <Button
            variant="ghost"
            icon="mic"
            iconOnly
            aria-label={recording ? 'Stop dictation' : 'Dictate'}
            aria-pressed={recording}
            className={cx(recording && 'is-recording')}
            onClick={() => {
              setRecording(!recording);
              onDictationChange?.(!recording);
            }}
          />
        )}
        <Button variant="primary" type="submit" icon="arrowUp" iconOnly aria-label="Send" disabled={!text.trim()} />
      </div>
    </form>
  );
}
