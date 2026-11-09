const { test } = require('node:test');
const assert = require('node:assert/strict');
const x = require('../Sources/GhostBrowser/Resources/X.js');
const request = (operation, variables, response, extra = {}) => ({ url: `https://x.com/i/api/graphql/hash/${operation}`, method: 'POST', body: JSON.stringify({variables}), response, status: 200, ...extra });
const tweet = (id, text, reply) => ({ data: {create_tweet: {tweet_results: {result: {rest_id:id, core:{user_results:{result:{rest_id:'7',legacy:{screen_name:'me'}}}},legacy:{full_text:text,in_reply_to_status_id_str:reply}}}}}});

test('confirmed likes preserve content at the time of the action', () => {
  const result = x.normalize(request('FavoriteTweet', {tweet_id:'123'}, {data:{favorite_tweet:'Done'}}, {context:{source_url:'https://x.com/home',post:{text:'original text',url:'https://x.com/sam/status/123',author:{handle:'sam'}}}}));
  assert.equal(result.type,'post.liked'); assert.equal(result.text,'original text'); assert.equal(result.fields.author.handle,'sam');
});
test('missing post content is explicit, not fabricated', () => {
  const result=x.normalize(request('FavoriteTweet',{tweet_id:'123'},{data:{favorite_tweet:'Done'}}));
  assert.equal(result.fields.content_capture,'unavailable'); assert.equal(result.text,null);
});
test('negative actions and reads are never observed', () => {
  for (const op of ['UnfavoriteTweet','DeleteTweet','Unfollow','HomeTimeline','UserTweets','CreateRetweet']) assert.equal(x.normalize(request(op,{tweet_id:'123'},{data:{favorite_tweet:'Done'}})),null);
  assert.equal(x.operation('https://x.com/i/api/1.1/friendships/destroy.json','POST'),null);
  assert.equal(x.operation('https://x.com/i/api/graphql/hash/FavoriteTweet','GET'),null);
  assert.equal(x.operation('https://evil.test/FavoriteTweet','POST'),null);
});
test('failed and ambiguous mutations do not become success events', () => {
  for (const response of [{errors:[{message:'no'}]}, {data:{favorite_tweet:'Unknown'}}, {}, 'bad']) assert.equal(x.normalize(request('FavoriteTweet',{tweet_id:'123'},response)),null);
  assert.equal(x.normalize(request('FavoriteTweet',{tweet_id:'123'},{data:{favorite_tweet:'Done'}},{status:403})),null);
});
test('published posts include exact server content and distinguish replies', () => {
  const post=x.normalize(request('CreateTweet',{tweet_text:'draft' },tweet('123','published')));
  assert.equal(post.type,'post.published'); assert.equal(post.text,'published'); assert.equal(post.fields.url,'https://x.com/me/status/123');
  const reply=x.normalize(request('CreateTweet',{tweet_text:'reply',reply:{in_reply_to_tweet_id:'123'}},tweet('456','reply')));
  assert.equal(reply.type,'reply.published'); assert.equal(reply.fields.reply_to_post_id,'123');
});
test('long posts, modern author fields and media are retained', () => {
  const response=tweet('789','truncated'); const result=response.data.create_tweet.tweet_results.result;
  result.note_tweet={note_tweet_results:{result:{text:'complete long post'}}};
  result.core.user_results.result={rest_id:'7',core:{screen_name:'modern',name:'Name'}};
  result.legacy.extended_entities={media:[{type:'photo',media_url_https:'https://pbs.twimg.com/photo.jpg',ext_alt_text:'description'}]};
  const event=x.normalize(request('CreateTweet',{},response));
  assert.equal(event.text,'complete long post'); assert.equal(event.fields.author.handle,'modern'); assert.equal(event.fields.media[0].alt,'description');
});
test('successful follows require positive confirmation', () => {
  const base={url:'https://x.com/i/api/1.1/friendships/create.json',method:'POST',body:'user_id=42',status:200};
  assert.equal(x.normalize({...base,response:{id_str:'42',screen_name:'sam',following:true}}).type,'account.followed');
  assert.equal(x.normalize({...base,response:{id_str:'42',screen_name:'sam',following:false}}),null);
  assert.equal(x.operation('https://api.x.com/1.1/friendships/create.json','POST'),'follow');
  assert.equal(x.operation('https://api.twitter.com/1.1/friendships/create.json','POST'),'follow');
});
test('following-list provenance is contextual, not guessed from event order', () => {
  assert.deepEqual(x.navigation('https://x.com/alex/following','https://x.com/alex'),{context:'x.following_list',list_owner:'alex'});
  assert.deepEqual(x.navigation('https://x.com/sam','https://x.com/alex/following'),{context:'x.profile_from_following_list',list_owner:'alex',account_handle:'sam'});
  assert.deepEqual(x.navigation('https://x.com/sam','https://x.com/home'),{});
  assert.deepEqual(x.navigation('https://x.com/home','https://x.com/alex/following'),{});
});
