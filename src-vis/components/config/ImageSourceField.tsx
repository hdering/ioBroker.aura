/**
 * One image source, entered every way the editor offers: typed (URL, adapter path, data: URI,
 * raw Base64), picked from the Aura server (DatapointPicker files → aura-file:) or uploaded from
 * the PC (stored inline as a data: URI). Shared by the Schalter widget's image mode and the
 * universal widget's switch cell in image mode, so both offer the same four ways.
 */
import { useRef, useState } from 'react';
import { FolderOpen, Upload } from 'lucide-react';
import { resolveImageSource } from '../../utils/assetUrl';
import { DatapointPicker } from './DatapointPicker';

interface Props {
    label: string;
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    placeholder?: string;
}

const fieldStyle = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};
const iconBtnCls = 'px-2 rounded-lg hover:opacity-80 shrink-0';

export function ImageSourceField({ label, value, onChange, placeholder }: Props) {
    const [picking, setPicking] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const src = value ?? '';
    const preview = resolveImageSource(src);

    return (
        <div className="aura-image-source-field space-y-1">
            <label className="text-[11px] block" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex gap-1">
                <input
                    type="text"
                    value={src}
                    onChange={(e) => onChange(e.target.value.trim() || undefined)}
                    placeholder={placeholder ?? 'https://… · /adapter/… · data:image/… · Base64'}
                    className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                    style={fieldStyle}
                />
                <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className={iconBtnCls}
                    style={{ ...fieldStyle, color: 'var(--text-secondary)' }}
                    title="Datei vom Server wählen"
                >
                    <FolderOpen size={13} />
                </button>
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className={iconBtnCls}
                    style={{ ...fieldStyle, color: 'var(--text-secondary)' }}
                    title="Bild vom PC hochladen (wird als Base64 gespeichert)"
                >
                    <Upload size={13} />
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => onChange(reader.result as string);
                        reader.readAsDataURL(file);
                    }}
                />
            </div>
            {src && (
                <div className="flex items-center gap-2">
                    {preview && (
                        <img
                            src={preview}
                            style={{
                                width: 32,
                                height: 32,
                                objectFit: 'contain',
                                border: '1px solid var(--app-border)',
                                borderRadius: 4,
                            }}
                            alt=""
                        />
                    )}
                    <span className="flex-1 min-w-0 text-[10px] truncate" style={{ color: 'var(--accent)' }}>
                        {src.startsWith('aura-file:')
                            ? src.slice('aura-file:'.length).split('/').pop()
                            : src.startsWith('data:')
                              ? 'Eingebettetes Bild (Base64)'
                              : ''}
                    </span>
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        className="text-[10px] hover:opacity-70 shrink-0"
                        style={{ color: 'var(--accent-red, #ef4444)' }}
                    >
                        Entfernen
                    </button>
                </div>
            )}
            {picking && (
                <DatapointPicker
                    modes={['files']}
                    defaultMode="files"
                    acceptMime={['image/*']}
                    currentValue={src}
                    onPickResult={(r) => {
                        if (r.kind === 'file') onChange(`aura-file:${r.path}`);
                    }}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
