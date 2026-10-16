import { RequestPage } from '@/components/board/request-page';

export default async function FeedbackRequestPage({ params }: PageProps<'/feedback/[id]'>) {
  const { id } = await params;
  return <RequestPage id={id} />;
}
