import {Mongo} from 'meteor/mongo'
import _ from 'lodash'

Posts = new Mongo.Collection('posts') //parent
Comments = new Mongo.Collection('comments') //inversed
Users = new Mongo.Collection('users') //single
Images = new Mongo.Collection('images') //many
Tags = new Mongo.Collection('tags') //many-inversed
Likes = new Mongo.Collection('likes') // count


Posts.remove({})
Comments.remove({})
Users.remove({})
Images.remove({})
Tags.remove({})
Likes.remove({})

//Set up the caches
Posts.cache({
	type:'one',
	collection:Users,
	cacheField:'_author',
	referenceField:'authorId',
	fields:{
		username:1, 
		profile:{
			first_name:1,
			last_name:1
		}
	},
})
Posts.cache({
	type:'inversed',
	collection:Comments,
	cacheField:'_comments',
	referenceField:'postId',
	fields:{message:1},
})
Posts.cache({
	type:'many',
	collection:Images,
	cacheField:'_images',
	referenceField:'imageIds',
	fields:{filename:1}
})
Posts.cache({
	type:'many-inversed',
	collection:Tags,
	cacheField:'_tags',
	referenceField:'postIds',
	fields:{name:1}
})
Posts.cacheCount({
	collection:Likes,
	cacheField:'_likes.all',
	referenceField:'postId'
})
Posts.cacheCount({
	collection:Likes,
	cacheField:'_likes.sweden',
	referenceField:'postId',
	selector:{country:'Sweden'}
})

Users.cacheField({
	cacheField:'_defaultTransform',
	fields:['username', 'profile.first_name', 'profile.last_name']
})
Users.cacheField({
	cacheField:'nested._customTransform',
	fields:['username', 'profile.first_name', 'profile.last_name'],
	transform(doc){
		return [doc.username, _.get(doc, 'profile.first_name'), _.get(doc, 'profile.last_name')]
	}
})

describe('Insert parent - no children', function(){
	Posts.insert({
		_id:'post1',
		authorId:'user1',
		imageIds:['dog', 'cat']
	})
	let post = Posts.findOne('post1')
	it('one cache should not exist', function(){
		assert.isUndefined(post._author)
	})
	it('many cache should be empty array', function(){
		assert.isArray(post._images)
		assert.strictEqual(post._images.length, 0)
	})
	it('inversed cache should be empty array', function(){
		assert.isArray(post._comments)
		assert.strictEqual(post._comments.length, 0)
	})
	it('many-inversed cache should be empty array', function(){
		assert.isArray(post._tags)
		assert.strictEqual(post._tags.length, 0)
	})
	it('unfiltered count should be 0', function(){
		assert.strictEqual(post._likes.all, 0)
	})
	it('filtered count should be 0', function(){
		assert.strictEqual(post._likes.sweden, 0)
	})
})
describe('Type: one', function(){
	describe('Insert child', function(){
		Users.insert({
			_id:'user1',
			username:'Simon',
			profile:{
				first_name:'Simon',
				last_name:'Herteby'
			}
		})
		let post = Posts.findOne('post1')
		let user = Users.findOne('user1', {fields:{_id:0, username:1, profile:1}})
		it('child should be deeply equal except _id', function(){
			assert.deepEqual(post._author, user)
		})
	})
	describe('Update child', function(){
		Users.update('user1', {$set:{'profile.last_name':'Svensson'}})
		let post = Posts.findOne('post1')
		let user = Users.findOne('user1', {fields:{_id:0, username:1, profile:1}})
		it('cache should have the new values', function(){
			assert.deepEqual(post._author, user)
		})
	})
	
	describe('Update parent referenceField', function(){
		Users.insert({
			_id:'user2',
			username:'Karl',
			profile:{
				first_name:'Karl',
				last_name:'Henriksson'
			}
		})
		Posts.update('post1', {$set:{authorId:'user2'}})
		let post = Posts.findOne('post1')
		let user = Users.findOne('user2', {fields:{_id:0, username:1, profile:1}})
		it('cache should reflect the new child', function(){
			assert.deepEqual(post._author, user)
		})
	})
	describe('Remove child', function(){
		Users.remove('user2')
		let post = Posts.findOne('post1')
		it('cache should be undefined', function(){
			assert.isUndefined(post._author)
		})
	})
	describe('Insert another parent', function(){
		Posts.insert({
			_id:'post2',
			authorId:'user1'
		})
		let post = Posts.findOne('post2')
		let user = Users.findOne('user1', {fields:{_id:0, username:1, profile:1}})
		it('new parent should have child in cache', function(){
			assert.deepEqual(post._author, user)
		})
	})
})


describe('Type: many', function(){
	describe('Insert child', function(){
		Images.insert({
			_id:'cat',
			filename:'cat.jpg'
		})
		let post = Posts.findOne('post1')
		let image = Images.findOne('cat')
		it('cache should contain child', function(){
			assert.deepEqual(post._images, [image])
		})
	})
	describe('Insert another child', function(){
		Images.insert({
			_id:'dog',
			filename:'dog.png'
		})
		let post = Posts.findOne('post1')
		let cat = Images.findOne('cat')
		let dog = Images.findOne('dog')
		it('cache should contain both children', function(){
			assert.deepEqual(post._images, [cat, dog])
		})
	})
	describe('Update children', function(){
		Images.find().forEach(image => {
			Images.update(image._id, {$set:{filename:image.filename + '.zip'}})
		})
		let post = Posts.findOne('post1')
		let cat = Images.findOne('cat')
		let dog = Images.findOne('dog')
		it('cache should contain both updated children', function(){
			assert.deepEqual(post._images, [cat, dog])
		})
	})
	describe('Remove child', function(){
		Images.remove('cat')
		let post = Posts.findOne('post1')
		let dog = Images.findOne('dog')
		it('cache should only contain the remaining child', function(){
			assert.deepEqual(post._images, [dog])
		})
	})
	describe('Insert unlinked child', function(){
		Images.insert({
			_id:'horse',
			filename:'horse.gif'
		})
		let post = Posts.findOne('post1')
		let dog = Images.findOne('dog')
		it('cache should not contain the inserted child', function(){
			assert.deepEqual(post._images, [dog])
		})
	})
	describe('Add child to parent referenceField', function(){
		Posts.update('post1', {$push:{imageIds:'horse'}})
		let post = Posts.findOne('post1')
		let horse = Images.findOne('horse')
		let dog = Images.findOne('dog')
		it('cache should contain both children', function(){
			assert.deepEqual(post._images, [dog, horse])
		})
	})
	describe('Remove child from parent referenceField', function(){
		Posts.update('post1', {$pull:{imageIds:'dog'}})
		let post = Posts.findOne('post1')
		let horse = Images.findOne('horse')
		it('cache should only contain remaining child', function(){
			assert.deepEqual(post._images, [horse])
		})
	})
	describe('Insert another parent', function(){
		Posts.insert({
			_id:'post3',
			imageIds:['dog', 'horse']
		})
		let post = Posts.findOne('post3')
		let dog = Images.findOne('dog')
		let horse = Images.findOne('horse')
		it('cache should have correct children', function(){
			assert.deepEqual(post._images, [dog, horse])
		})
	})
})


describe('Type: inversed', function(){
	describe('Insert child', function(){
		Comments.insert({
			_id:'comment1',
			message:'Hello world!',
			postId:'post1'
		})
		let post = Posts.findOne('post1')
		let comment = Comments.findOne('comment1', {fields:{postId:0}})
		it('cache should contain child', function(){
			assert.deepEqual(post._comments, [comment])
		})
	})
	describe('Insert another child', function(){
		Comments.insert({
			_id:'comment2',
			message:'Hello world!',
			postId:'post1'
		})
		let post = Posts.findOne('post1')
		let comment1 = Comments.findOne('comment1', {fields:{postId:0}})
		let comment2 = Comments.findOne('comment2', {fields:{postId:0}})
		it('cache should contain both children', function(){
			assert.deepEqual(post._comments, [comment1, comment2])
		})
	})
	describe('Insert unlinked child', function(){
		Comments.insert({
			_id:'comment3',
			message:'Hello world again!',
		})
		let post = Posts.findOne('post1')
		let comment1 = Comments.findOne('comment1', {fields:{postId:0}})
		let comment2 = Comments.findOne('comment2', {fields:{postId:0}})
		it('cache should not contain new child', function(){
			assert.deepEqual(post._comments, [comment1, comment2])
		})
	})
	describe('Update child referenceField', function(){
		Comments.update('comment3', {$set:{postId:'post1'}})
		let post = Posts.findOne('post1')
		let comment1 = Comments.findOne('comment1', {fields:{postId:0}})
		let comment2 = Comments.findOne('comment2', {fields:{postId:0}})
		let comment3 = Comments.findOne('comment3', {fields:{postId:0}})
		it('cache should contain new and previous children', function(){
			assert.deepEqual(post._comments, [comment1, comment2, comment3])
		})
	})
	describe('Update children', function(){
		Comments.update({}, {$set:{message:'Goodbye world!'}}, {multi:true})
		let post = Posts.findOne('post1')
		let comment1 = Comments.findOne('comment1', {fields:{postId:0}})
		let comment2 = Comments.findOne('comment2', {fields:{postId:0}})
		let comment3 = Comments.findOne('comment3', {fields:{postId:0}})
		it('cache should contain updated children', function(){
			assert.deepEqual(post._comments, [comment1, comment2, comment3])
		})
	})
	describe('Remove child', function(){
		Comments.remove('comment2')
		let post = Posts.findOne('post1')
		let comment1 = Comments.findOne('comment1', {fields:{postId:0}})
		let comment3 = Comments.findOne('comment3', {fields:{postId:0}})
		it('cache should only contain remaining children', function(){
			assert.deepEqual(post._comments, [comment1, comment3])
		})
	})
	describe('Remove parent from child referenceField', function(){
		Comments.update('comment3', {$unset:{postId:1}})
		let post = Posts.findOne('post1')
		let comment1 = Comments.findOne('comment1', {fields:{postId:0}})
		it('cache should only contain remaining child', function(){
			assert.deepEqual(post._comments, [comment1])
		})
	})
	describe('Insert another parent', function(){
		Comments.update({}, {$set:{postId:'post4'}}, {multi:true})
		Posts.insert({
			_id:'post4'
		})
		let post = Posts.findOne('post4')
		let comments = Comments.find({}, {fields:{postId:0}}).fetch()
		it('cache should contain all children', function(){
			assert.deepEqual(post._comments, comments)
		})
	})
})


describe('Type: many-inversed', function(){
	describe('Insert child', function(){
		Tags.insert({
			_id:'tag1',
			name:'Red',
			postIds:['post1', 'post2']
		})
		let post1 = Posts.findOne('post1')
		let post2 = Posts.findOne('post2')
		let post3 = Posts.findOne('post3')
		let tag = Tags.findOne('tag1', {fields:{postIds:0}})
		it('parent1 should contain child', function(){
			assert.deepEqual(post1._tags, [tag])
		})
		it('parent2 should contain child', function(){
			assert.deepEqual(post2._tags, [tag])
		})
		it('parent3 should not contain child', function(){
			assert.deepEqual(post3._tags, [])
		})
	})
	describe('Insert another child', function(){
		Tags.insert({
			_id:'tag2',
			name:'Blue',
			postIds:['post1', 'post2']
		})
		let post1 = Posts.findOne('post1')
		let post2 = Posts.findOne('post2')
		let tag1 = Tags.findOne('tag1', {fields:{postIds:0}})
		let tag2 = Tags.findOne('tag2', {fields:{postIds:0}})
		it('parent1 should contain both children', function(){
			assert.deepEqual(post1._tags, [tag1, tag2])
		})
		it('parent2 should contain both children', function(){
			assert.deepEqual(post2._tags, [tag1, tag2])
		})
	})
	describe('Insert unlinked child', function(){
		Tags.insert({
			_id:'tag3',
			name:'Green'
		})
		let post = Posts.findOne('post1')
		let tag1 = Tags.findOne('tag1', {fields:{postIds:0}})
		let tag2 = Tags.findOne('tag2', {fields:{postIds:0}})
		let tag3 = Tags.findOne('tag3', {fields:{postIds:0}})
		it('cache should not contain new child', function(){
			assert.deepEqual(post._tags, [tag1, tag2])
		})
	})
	describe('Update child referenceField', function(){
		Tags.update('tag3', {$set:{'postIds':['post1', 'post2']}})
		let post1 = Posts.findOne('post1')
		let post2 = Posts.findOne('post2')
		let tag1 = Tags.findOne('tag1', {fields:{postIds:0}})
		let tag2 = Tags.findOne('tag2', {fields:{postIds:0}})
		let tag3 = Tags.findOne('tag3', {fields:{postIds:0}})
		it('parent1 should now contain the child', function(){
			assert.deepEqual(post1._tags, [tag1, tag2, tag3])
		})
		it('parent2 should now contain the child', function(){
			assert.deepEqual(post2._tags, [tag1, tag2, tag3])
		})
	})
	describe('Update child referenceField', function(){
		Tags.find().forEach(tag => {
			Tags.update(tag._id, {$set:{name:'color-' + tag.name}})
		})
		let post1 = Posts.findOne('post1')
		let post2 = Posts.findOne('post2')
		let tag1 = Tags.findOne('tag1', {fields:{postIds:0}})
		let tag2 = Tags.findOne('tag2', {fields:{postIds:0}})
		let tag3 = Tags.findOne('tag3', {fields:{postIds:0}})
		it('parent1 should contain updated children', function(){
			assert.deepEqual(post1._tags, [tag1, tag2, tag3])
		})
		it('parent2 should contain updated children', function(){
			assert.deepEqual(post2._tags, [tag1, tag2, tag3])
		})
	})
	describe('Remove child', function(){
		Tags.remove('tag1')
		let post1 = Posts.findOne('post1')
		let post2 = Posts.findOne('post2')
		let tag2 = Tags.findOne('tag2', {fields:{postIds:0}})
		let tag3 = Tags.findOne('tag3', {fields:{postIds:0}})
		it('parent1 should only contain remaining children', function(){
			assert.deepEqual(post1._tags, [tag2, tag3])
		})
		it('parent2 should only contain remaining children', function(){
			assert.deepEqual(post2._tags, [tag2, tag3])
		})
	})
	describe('Remove parent2 from child referenceField', function(){
		Tags.update('tag3', {$pull:{postIds:'post2'}})
		let post1 = Posts.findOne('post1')
		let post2 = Posts.findOne('post2')
		let tag2 = Tags.findOne('tag2', {fields:{postIds:0}})
		let tag3 = Tags.findOne('tag3', {fields:{postIds:0}})
		it('parent1 should still contain child', function(){
			assert.deepEqual(post1._tags, [tag2, tag3])
		})
		it('parent2 should not contain child', function(){
			assert.deepEqual(post2._tags, [tag2])
		})
	})
	describe('Insert another parent', function(){
		Tags.update({}, {$push:{postIds:'post5'}}, {multi:true})
		Posts.insert({
			_id:'post5'
		})
		let post = Posts.findOne('post5')
		let tags = Tags.find({}, {fields:{postIds:0}}).fetch()
		it('new parent should contain all children', function(){
			assert.deepEqual(post._tags, tags)
		})
	})

	describe('cacheCount', function(){
		describe('Insert child matching filter', function(){
			Likes.insert({
				_id:'like1',
				postId:'post1',
				country:'Sweden'
			})
			let post = Posts.findOne('post1')
			it('unfiltered count should be 1', function(){
				assert.strictEqual(post._likes.all, 1)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post._likes.sweden, 1)
			})
		})
		describe('Insert child not matching filter', function(){
			Likes.insert({
				_id:'like2',
				postId:'post1',
				country:'Norway'
			})
			let post = Posts.findOne('post1')
			it('unfiltered count should be 2', function(){
				assert.strictEqual(post._likes.all, 2)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post._likes.sweden, 1)
			})
		})
		describe('Insert new parent', function(){
			Likes.insert({
				_id:'like3',
				postId:'post6',
				country:'Sweden'
			})
			Likes.insert({
				_id:'like4',
				postId:'post6',
			})
			Posts.insert({_id:'post6'})
			let post = Posts.findOne('post6')
			it('unfiltered count should be 2', function(){
				assert.strictEqual(post._likes.all, 2)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post._likes.sweden, 1)
			})
		})
		describe('Remove child not matching filter', function(){
			Likes.remove('like2')
			let post = Posts.findOne('post1')
			it('unfiltered count should be 1', function(){
				assert.strictEqual(post._likes.all, 1)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post._likes.sweden, 1)
			})
		})
		describe('Remove child matching filter', function(){
			Likes.remove('like1')
			let post = Posts.findOne('post1')
			it('unfiltered count should be 1', function(){
				assert.strictEqual(post._likes.all, 0)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post._likes.sweden, 0)
			})
		})
	})
})

describe('cacheField', function(){
	describe('Insert document', function(){
		Users.insert({
			_id:'simon',
			username:'Simon89',
			profile:{
				first_name:'Simon',
				last_name:'Herteby'
			}
		})
		let user = Users.findOne('simon')
		it('default transform field should be correct', function(){
			assert.strictEqual(user._defaultTransform, 'Simon89, Simon, Herteby')
		})
		it('custom transform field should be correct', function(){
			assert.deepEqual(user.nested._customTransform, ['Simon89', 'Simon', 'Herteby'])
		})
	})
	describe('Update document', function(){
		Users.update('simon', {$set:{profile:{first_name:'Karl', last_name:'Svensson'}}})
		let user = Users.findOne('simon')
		it('default transform field should be correct', function(){
			assert.strictEqual(user._defaultTransform, 'Simon89, Karl, Svensson')
		})
		it('custom transform field should be correct', function(){
			assert.deepEqual(user.nested._customTransform, ['Simon89', 'Karl', 'Svensson'])
		})
	})
	describe('Unset field', function(){
		Users.update('simon', {$unset:{username:1}})
		let user = Users.findOne('simon')
		it('default transform field should be correct', function(){
			assert.strictEqual(user._defaultTransform, 'Karl, Svensson')
		})
		it('custom transform field should be correct', function(){
			assert.deepEqual(user.nested._customTransform, [null, 'Karl', 'Svensson'])
		})
	})
	describe('Unset nested field', function(){
		Users.update('simon', {$unset:{'profile.first_name':1}})
		let user = Users.findOne('simon')
		it('default transform field should be correct', function(){
			assert.strictEqual(user._defaultTransform, 'Svensson')
		})
		it('custom transform field should be correct', function(){
			assert.deepEqual(user.nested._customTransform, [null, null, 'Svensson'])
		})
	})
})


//Run the same tests but with nested fields

Posts.remove({})
Comments.remove({})
Users.remove({})
Images.remove({})
Tags.remove({})
Likes.remove({})

//Set up the caches
Posts.cache({
	type:'one',
	collection:Users,
	cacheField:'caches._author',
	referenceField:'nested.authorId',
	fields:{
		username:1, 
		profile:{
			first_name:1,
			last_name:1
		}
	},
})
Posts.cache({
	type:'inversed',
	collection:Comments,
	cacheField:'caches._comments',
	referenceField:'nested.postId',
	fields:{message:1},
})
Posts.cache({
	type:'many',
	collection:Images,
	cacheField:'caches._images',
	referenceField:'nested.images:_id',
	fields:{filename:1}
})
Posts.cache({
	type:'many-inversed',
	collection:Tags,
	cacheField:'caches._tags',
	referenceField:'nested.postIds:_id',
	fields:{name:1}
})
Posts.cacheCount({
	collection:Likes,
	cacheField:'caches._likes.all',
	referenceField:'nested.postId'
})
Posts.cacheCount({
	collection:Likes,
	cacheField:'caches._likes.sweden',
	referenceField:'nested.postId',
	selector:{country:'Sweden'}
})


describe('Same tests with nested referenceFields and cacheFields!🚀', function(){
	describe('Insert parent - no children', function(){
		Posts.insert({
			_id:'post1',
			nested:{
				authorId:'user1',
				images:[{_id:'dog'}, {_id:'cat'}]
			}
		})
		let post = Posts.findOne('post1')
		it('one cache should not exist', function(){
			assert.isUndefined(post.caches._author)
		})
		it('many cache should be empty array', function(){
			assert.isArray(post.caches._images)
			assert.strictEqual(post.caches._images.length, 0)
		})
		it('inverse cache should be empty array', function(){
			assert.isArray(post.caches._comments)
			assert.strictEqual(post.caches._comments.length, 0)
		})
		it('many-inverse cache should be empty array', function(){
			assert.isArray(post.caches._tags)
			assert.strictEqual(post.caches._tags.length, 0)
		})	
	})
	describe('Type: one', function(){
		describe('Insert child', function(){
			Users.insert({
				_id:'user1',
				username:'Simon',
				profile:{
					first_name:'Simon',
					last_name:'Herteby'
				}
			})
			let post = Posts.findOne('post1')
			let user = Users.findOne('user1', {fields:{_id:0, username:1, profile:1}})
			it('child should be deeply equal except _id', function(){
				assert.deepEqual(post.caches._author, user)
			})
		})
		describe('Update child', function(){
			Users.update('user1', {$set:{'profile.last_name':'Svensson'}})
			let post = Posts.findOne('post1')
			let user = Users.findOne('user1', {fields:{_id:0, username:1, profile:1}})
			it('cache should have the new values', function(){
				assert.deepEqual(post.caches._author, user)
			})
		})

		describe('Update parent referenceField', function(){
			Users.insert({
				_id:'user2',
				username:'Karl',
				profile:{
					first_name:'Karl',
					last_name:'Henriksson'
				}
			})
			Posts.update('post1', {$set:{'nested.authorId':'user2'}})
			let post = Posts.findOne('post1')
			let user = Users.findOne('user2', {fields:{_id:0, username:1, profile:1}})
			it('cache should reflect the new child', function(){
				assert.deepEqual(post.caches._author, user)
			})
		})
		describe('Remove child', function(){
			Users.remove('user2')
			let post = Posts.findOne('post1')
			it('cache should be undefined', function(){
				assert.isUndefined(post.caches._author)
			})
		})
		describe('Insert another parent', function(){
			Posts.insert({
				_id:'post2',
				nested:{authorId:'user1'}
			})
			let post = Posts.findOne('post2')
			let user = Users.findOne('user1', {fields:{_id:0, username:1, profile:1}})
			it('new parent should have child in cache', function(){
				assert.deepEqual(post.caches._author, user)
			})
		})
	})

	describe('Type: many', function(){
		describe('Insert child', function(){
			Images.insert({
				_id:'cat',
				filename:'cat.jpg'
			})
			let post = Posts.findOne('post1')
			let image = Images.findOne('cat')
			it('cache should contain child', function(){
				assert.deepEqual(post.caches._images, [image])
			})
		})
		describe('Insert another child', function(){
			Images.insert({
				_id:'dog',
				filename:'dog.png'
			})
			let post = Posts.findOne('post1')
			let cat = Images.findOne('cat')
			let dog = Images.findOne('dog')
			it('cache should contain both children', function(){
				assert.deepEqual(post.caches._images, [cat, dog])
			})
		})
		describe('Update children', function(){
			Images.find().forEach(image => {
				Images.update(image._id, {$set:{filename:image.filename + '.zip'}})
			})
			let post = Posts.findOne('post1')
			let cat = Images.findOne('cat')
			let dog = Images.findOne('dog')
			it('cache should contain both updated children', function(){
				assert.deepEqual(post.caches._images, [cat, dog])
			})
		})
		describe('Remove child', function(){
			Images.remove('cat')
			let post = Posts.findOne('post1')
			let dog = Images.findOne('dog')
			it('cache should only contain the remaining child', function(){
				assert.deepEqual(post.caches._images, [dog])
			})
		})
		describe('Insert unlinked child', function(){
			Images.insert({
				_id:'horse',
				filename:'horse.gif'
			})
			let post = Posts.findOne('post1')
			let dog = Images.findOne('dog')
			it('cache should not contain the inserted child', function(){
				assert.deepEqual(post.caches._images, [dog])
			})
		})
		describe('Add child to parent referenceField', function(){
			Posts.update('post1', {$push:{'nested.images':{_id:'horse'}}})
			let post = Posts.findOne('post1')
			let horse = Images.findOne('horse')
			let dog = Images.findOne('dog')
			it('cache should contain both children', function(){
				assert.deepEqual(post.caches._images, [dog, horse])
			})
		})
		describe('Remove child from parent referenceField', function(){
			Posts.update('post1', {$pull:{'nested.images':{_id:'dog'}}})
			let post = Posts.findOne('post1')
			let horse = Images.findOne('horse')
			it('cache should only contain remaining child', function(){
				assert.deepEqual(post.caches._images, [horse])
			})
		})
		describe('Insert another parent', function(){
			Posts.insert({
				_id:'post3',
				nested:{
					images:[{_id:'dog'}, {_id:'horse'}]
				}
			})
			let post = Posts.findOne('post3')
			let dog = Images.findOne('dog')
			let horse = Images.findOne('horse')
			it('cache should have correct children', function(){
				assert.deepEqual(post.caches._images, [dog, horse])
			})
		})
	})

	describe('Type: inversed', function(){
		describe('Insert child', function(){
			Comments.insert({
				_id:'comment1',
				message:'Hello world!',
				nested:{postId:'post1'}
			})
			let post = Posts.findOne('post1')
			let comment = Comments.findOne('comment1', {fields:{nested:0}})
			it('cache should contain child', function(){
				assert.deepEqual(post.caches._comments, [comment])
			})
		})
		describe('Insert another child', function(){
			Comments.insert({
				_id:'comment2',
				message:'Hello world!',
				nested:{postId:'post1'}
			})
			let post = Posts.findOne('post1')
			let comment1 = Comments.findOne('comment1', {fields:{nested:0}})
			let comment2 = Comments.findOne('comment2', {fields:{nested:0}})
			it('cache should contain both children', function(){
				assert.deepEqual(post.caches._comments, [comment1, comment2])
			})
		})
		describe('Insert unlinked child', function(){
			Comments.insert({
				_id:'comment3',
				message:'Hello world again!',
			})
			let post = Posts.findOne('post1')
			let comment1 = Comments.findOne('comment1', {fields:{nested:0}})
			let comment2 = Comments.findOne('comment2', {fields:{nested:0}})
			it('cache should not contain new child', function(){
				assert.deepEqual(post.caches._comments, [comment1, comment2])
			})
		})
		describe('Update child referenceField', function(){
			Comments.update('comment3', {$set:{'nested.postId':'post1'}})
			let post = Posts.findOne('post1')
			let comment1 = Comments.findOne('comment1', {fields:{nested:0}})
			let comment2 = Comments.findOne('comment2', {fields:{nested:0}})
			let comment3 = Comments.findOne('comment3', {fields:{nested:0}})
			it('cache should contain new and previous children', function(){
				assert.deepEqual(post.caches._comments, [comment1, comment2, comment3])
			})
		})
		describe('Update children', function(){
			Comments.update({}, {$set:{message:'Goodbye world!'}}, {multi:true})
			let post = Posts.findOne('post1')
			let comment1 = Comments.findOne('comment1', {fields:{nested:0}})
			let comment2 = Comments.findOne('comment2', {fields:{nested:0}})
			let comment3 = Comments.findOne('comment3', {fields:{nested:0}})
			it('cache should contain updated children', function(){
				assert.deepEqual(post.caches._comments, [comment1, comment2, comment3])
			})
		})
		describe('Remove child', function(){
			Comments.remove('comment2')
			let post = Posts.findOne('post1')
			let comment1 = Comments.findOne('comment1', {fields:{nested:0}})
			let comment3 = Comments.findOne('comment3', {fields:{nested:0}})
			it('cache should only contain remaining children', function(){
				assert.deepEqual(post.caches._comments, [comment1, comment3])
			})
		})
		describe('Remove parent from child referenceField', function(){
			Comments.update('comment3', {$unset:{'nested.postId':1}})
			let post = Posts.findOne('post1')
			let comment1 = Comments.findOne('comment1', {fields:{nested:0}})
			it('cache should only contain remaining child', function(){
				assert.deepEqual(post.caches._comments, [comment1])
			})
		})
		describe('Insert another parent', function(){
			Comments.update({}, {$set:{'nested.postId':'post4'}}, {multi:true})
			Posts.insert({
				_id:'post4'
			})
			let post = Posts.findOne('post4')
			let comments = Comments.find({}, {fields:{nested:0}}).fetch()
			it('cache should contain all children', function(){
				assert.deepEqual(post.caches._comments, comments)
			})
		})
	})

	describe('Type: many-inversed', function(){
		describe('Insert child', function(){
			Tags.insert({
				_id:'tag1',
				name:'Red',
				nested:{postIds:[{_id:'post1'}, {_id:'post2'}]}
			})
			let post1 = Posts.findOne('post1')
			let post2 = Posts.findOne('post2')
			let post3 = Posts.findOne('post3')
			let tag = Tags.findOne('tag1', {fields:{nested:0}})
			it('parent1 should contain child', function(){
				assert.deepEqual(post1.caches._tags, [tag])
			})
			it('parent2 should contain child', function(){
				assert.deepEqual(post2.caches._tags, [tag])
			})
			it('parent3 should not contain child', function(){
				assert.deepEqual(post3.caches._tags, [])
			})
		})
		describe('Insert another child', function(){
			Tags.insert({
				_id:'tag2',
				name:'Blue',
				nested:{postIds:[{_id:'post1'}, {_id:'post2'}]}
			})
			let post1 = Posts.findOne('post1')
			let post2 = Posts.findOne('post2')
			let tag1 = Tags.findOne('tag1', {fields:{nested:0}})
			let tag2 = Tags.findOne('tag2', {fields:{nested:0}})
			it('parent1 should contain both children', function(){
				assert.deepEqual(post1.caches._tags, [tag1, tag2])
			})
			it('parent2 should contain both children', function(){
				assert.deepEqual(post2.caches._tags, [tag1, tag2])
			})
		})
		describe('Insert unlinked child', function(){
			Tags.insert({
				_id:'tag3',
				name:'Green'
			})
			let post = Posts.findOne('post1')
			let tag1 = Tags.findOne('tag1', {fields:{nested:0}})
			let tag2 = Tags.findOne('tag2', {fields:{nested:0}})
			let tag3 = Tags.findOne('tag3', {fields:{nested:0}})
			it('cache should not contain new child', function(){
				assert.deepEqual(post.caches._tags, [tag1, tag2])
			})
		})
		describe('Update child referenceField', function(){
			Tags.update('tag3', {$set:{'nested.postIds':[{_id:'post1'}, {_id:'post2'}]}})
			let post1 = Posts.findOne('post1')
			let post2 = Posts.findOne('post2')
			let tag1 = Tags.findOne('tag1', {fields:{nested:0}})
			let tag2 = Tags.findOne('tag2', {fields:{nested:0}})
			let tag3 = Tags.findOne('tag3', {fields:{nested:0}})
			it('parent1 should now contain the child', function(){
				assert.deepEqual(post1.caches._tags, [tag1, tag2, tag3])
			})
			it('parent2 should now contain the child', function(){
				assert.deepEqual(post2.caches._tags, [tag1, tag2, tag3])
			})
		})
		describe('Update children', function(){
			Tags.find().forEach(tag => {
				Tags.update(tag._id, {$set:{name:'color-' + tag.name}})
			})
			let post1 = Posts.findOne('post1')
			let post2 = Posts.findOne('post2')
			let tag1 = Tags.findOne('tag1', {fields:{nested:0}})
			let tag2 = Tags.findOne('tag2', {fields:{nested:0}})
			let tag3 = Tags.findOne('tag3', {fields:{nested:0}})
			it('parent1 should contain updated children', function(){
				assert.deepEqual(post1.caches._tags, [tag1, tag2, tag3])
			})
			it('parent2 should contain updated children', function(){
				assert.deepEqual(post2.caches._tags, [tag1, tag2, tag3])
			})
		})
		describe('Remove child', function(){
			Tags.remove('tag1')
			let post1 = Posts.findOne('post1')
			let post2 = Posts.findOne('post2')
			let tag2 = Tags.findOne('tag2', {fields:{nested:0}})
			let tag3 = Tags.findOne('tag3', {fields:{nested:0}})
			it('parent1 should only contain remaining children', function(){
				assert.deepEqual(post1.caches._tags, [tag2, tag3])
			})
			it('parent2 should only contain remaining children', function(){
				assert.deepEqual(post2.caches._tags, [tag2, tag3])
			})
		})
		describe('Remove parent2 from child referenceField', function(){
			Tags.update('tag3', {$pull:{'nested.postIds':{_id:'post2'}}})
			let post1 = Posts.findOne('post1')
			let post2 = Posts.findOne('post2')
			let tag2 = Tags.findOne('tag2', {fields:{nested:0}})
			let tag3 = Tags.findOne('tag3', {fields:{nested:0}})
			it('parent1 should still contain child', function(){
				assert.deepEqual(post1.caches._tags, [tag2, tag3])
			})
			it('parent2 should not contain child', function(){
				assert.deepEqual(post2.caches._tags, [tag2])
			})
		})
		describe('Insert another parent', function(){
			Tags.update({}, {$push:{'nested.postIds':{_id:'post5'}}}, {multi:true})
			Posts.insert({
				_id:'post5'
			})
			let post = Posts.findOne('post5')
			let tags = Tags.find({}, {fields:{nested:0}}).fetch()
			it('new parent should contain all children', function(){
				assert.deepEqual(post.caches._tags, tags)
			})
		})
	})

	describe('cacheCount', function(){
		describe('Insert child matching filter', function(){
			Likes.insert({
				_id:'like1',
				nested:{postId:'post1'},
				country:'Sweden'
			})
			let post = Posts.findOne('post1')
			it('unfiltered count should be 1', function(){
				assert.strictEqual(post.caches._likes.all, 1)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post.caches._likes.sweden, 1)
			})
		})
		describe('Insert child not matching filter', function(){
			Likes.insert({
				_id:'like2',
				nested:{postId:'post1'},
				country:'Norway'
			})
			let post = Posts.findOne('post1')
			it('unfiltered count should be 2', function(){
				assert.strictEqual(post.caches._likes.all, 2)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post.caches._likes.sweden, 1)
			})
		})
		describe('Insert new parent', function(){
			Likes.insert({
				_id:'like3',
				nested:{postId:'post6'},
				country:'Sweden'
			})
			Likes.insert({
				_id:'like4',
				nested:{postId:'post6'},
			})
			Posts.insert({_id:'post6'})
			let post = Posts.findOne('post6')
			it('unfiltered count should be 2', function(){
				assert.strictEqual(post.caches._likes.all, 2)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post.caches._likes.sweden, 1)
			})
		})
		describe('Remove child not matching filter', function(){
			Likes.remove('like2')
			let post = Posts.findOne('post1')
			it('unfiltered count should be 1', function(){
				assert.strictEqual(post.caches._likes.all, 1)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post.caches._likes.sweden, 1)
			})
		})
		describe('Remove child matching filter', function(){
			Likes.remove('like1')
			let post = Posts.findOne('post1')
			it('unfiltered count should be 1', function(){
				assert.strictEqual(post.caches._likes.all, 0)
			})
			it('filtered count should be 1', function(){
				assert.strictEqual(post.caches._likes.sweden, 0)
			})
		})
	})
})