import { usePromptInput } from './context';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/attachments';

export function PromptInputAttachments() {
  const { images, removeImage } = usePromptInput();

  if (images.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1">
      <Attachments variant="grid">
        {images.map((img) => (
          <Attachment key={img.id}>
            <AttachmentPreview
              src={img.dataUrl}
              alt={img.filename}
              mimeType={img.mimeType}
            />
            <AttachmentRemove onRemove={() => removeImage(img.id)} />
          </Attachment>
        ))}
      </Attachments>
    </div>
  );
}
