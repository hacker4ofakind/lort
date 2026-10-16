import type PocketBase from 'pocketbase';

import { errorMessage } from '@/lib/errors';
import type { CommentInput } from './request-view';

/** Posts a comment or reply with its images. Throws a friendly Error for the composer to show. */
export async function postComment(pb: PocketBase, requestId: string, input: CommentInput) {
  const data = new FormData();
  data.set('request', requestId);
  data.set('body', input.text);
  data.set('internal', String(input.visibility === 'internal'));
  if (input.parent) data.set('parent', input.parent);
  input.images.forEach((f) => data.append('images', f));
  data.set('website', '');
  try {
    await pb.collection('comments').create(data);
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

/** Deletes a comment; a top-level one takes its replies with it (server hook). Throws a friendly Error. */
export async function deleteComment(pb: PocketBase, commentId: string) {
  try {
    await pb.collection('comments').delete(commentId);
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}
