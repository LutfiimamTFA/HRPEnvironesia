import {notFound} from 'next/navigation';
import {getRequestConfig} from 'next-intl/server';
 
// Can be imported from a shared config
const locales = ['id', 'en'];
 
export default getRequestConfig(async ({locale}) => {
  // Validate that the incoming `locale` parameter is valid
  if (!locales.includes(locale as any)) notFound();
 
  let messages;
  switch (locale) {
    case 'en':
      messages = (await import('./messages/en.json')).default;
      break;
    case 'id':
      messages = (await import('./messages/id.json')).default;
      break;
    default:
      notFound();
  }
 
  return {
    messages
  };
});
