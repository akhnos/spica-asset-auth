import * as Bucket from '@spica-devkit/bucket';
import * as Identity from '@spica-devkit/identity';
import { database, close, ObjectId } from '@spica-devkit/database';

/*
    1. To use this asset you need to create identity_id:string and activated:boolean (default: false) field in your user bucket.
    2. You should install a mail asset, we recommend "Mailer"
    3. Please customize everywhere you see CUSTOMIZED regarding your project.
    4. This function is batching-ready, so you can enable batching
*/

// ------- Insert your APIKEY, mailerBucketId and usersBucketId.
Bucket.initialize({ apikey: process.env.AUTH_APIKEY });
Identity.initialize({ apikey: process.env.AUTH_APIKEY });

const mailerBucketId = process.env.MAILER_BUCKET_ID;
const usersBucketId = process.env.USER_BUCKET_ID;
const defaultPolicyId = process.env.DEFAULT_POLICY_ID;
// -------

export default async function (req, res) {
  // ------- CUSTOMIZED
  const { identifier, password, firstName, lastName } = req.body;
  const userObject = {
    email: identifier,
    first_name: firstName,
    last_name: lastName,
  }; // You can enter your user bucket fields you want to set
  // -------

  if (identifier && password) {
    let identity = await Identity.insert({
      identifier,
      password,
      policies: [],
    }).catch((err) => {
      console.log(err);
      return err;
    });

    if (identity.id) {
      let user = await Bucket.data.insert(usersBucketId, {
        ...userObject,
        identity_id: identity._id,
      });

      const db = await database();
      const identityCollection = db.collection('identity');
      const _identity = await identityCollection.findOne({
        _id: ObjectId(identity._id),
      });
      _identity.password = '_' + _identity.password;
      _identity.policies = [defaultPolicyId];
      await identityCollection.update(
        { _id: ObjectId(identity._id) },
        { $set: _identity }
      );
      close();

      // ------- CUSTOMIZED
      // If you want to use Mailer asset, you need to enter your template name and variables
      Bucket.data.insert(mailerBucketId, {
        title: `User Registration ${identifier}`, // You don't need to change
        template: 'register-1', // You can change here
        variables: `{"user_name": "${identifier}","id": "${user._id}"}`, // You can change here
        emails: [identifier], // Don't change
      });
      // -------

      return res
        .status(200)
        .send({ message: 'Registration started', data: user._id });
    } else {
      return res.status(400).send({ message: identity.message });
    }
  }
  return res
    .status(400)
    .send({ message: 'Invalid email or password provided' });
}

export async function verifyRegistration(req, res) {
  let userId = req.query.code;
  let user = await Bucket.data.get(usersBucketId, userId);

  if (!user.activated) {
    const db = await database();
    const identityCollection = db.collection('identity');
    const _identity = await identityCollection.findOne({
      _id: ObjectId(user.identity_id),
    });
    _identity.password = _identity.password.substring(1);
    await identityCollection.update(
      { _id: ObjectId(_identity._id) },
      { $set: _identity }
    );
    close();

    user['activated'] = true;
    await Bucket.data.update(usersBucketId, userId, user);
    return res.status(200).send({ message: 'Registration verified' });
  } else {
    return res.status(400).send({ messageD: 'Invalid email code provided' });
  }
}

export async function reactivate({ query }, res) {
  const user = await Bucket.data
    .getAll(usersBucketId, {
      queryParams: {
        filter: {
          email: query.identifier,
        },
      },
    })
    .then((user) => {
      return user[0];
    });

  if (user && user._id && !user['activated']) {
    await Bucket.data.insert(mailerBucketId, {
      title: `User Registration ${query.identifier}`,
      template: 'registration-1',
      variables: `{"username": "${query.identifier}","user_id": "${user._id}"}`,
      email: [query.identifier],
    });

    return res
      .status(200)
      .send({ message: 'Registration restarted', data: user._id });
  } else {
    return res.status(400).send({});
  }
}
