// Meta standard conversion events from the supplied Pixel reference, plus
// PageView, the base Pixel event. Names are case-sensitive.
export const metaStandardEvents = ['PageView','ViewContent','Search','AddToCart','AddToWishlist','InitiateCheckout','AddPaymentInfo','Purchase','Lead','CompleteRegistration','Contact','CustomizeProduct','Donate','FindLocation','Schedule','StartTrial','SubmitApplication','Subscribe'];

export const metaEventType = name => metaStandardEvents.includes(name) ? 'standard' : 'custom';

export const metaStandardProperties = ['content_category','content_ids','content_name','content_type','contents','currency','num_items','predicted_ltv','search_string','status','value'];
export const isMetaStandardField = name => metaStandardProperties.includes(name.match(/^cd\[(.+)\]$/)?.[1]);
