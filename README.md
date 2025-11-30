# secret santa

a simple web app for secret santa exchanges. everyone gets a code, you leave hints for your person to find, and when they find your hidden code they can reveal who you are.

## how it works

**you get assigned someone to gift to.** you set 3 hints:
- hint 1: where you hid gift 1
- hint 2: where you hid gift 2  
- hint 3: where you hid the paper with your code written on it

**your secret santa uses your hints** to find both gifts and the paper with your code on it. once they have your code, they can enter it and find out you were their secret santa.

## setup

install dependencies:
```bash
npm install
```

set your admin password hash in `.env`:
```
ADMIN_PASS_HASH=somethinsething
```

(that hash is "admin123". to make your own: `node -e "console.log(require('crypto').createHash('sha256').update('yourpassword').digest('hex'))"`)

start the server:
```bash
npm start
```

go to `http://localhost:3001`

## admin stuff

go to `/admin` to log in. from there you can:
- regenerate all codes (resets everything)
- see who has set their hints
- see all the assignments

the "regenerate codes" button will create new random assignments and new codes for everyone.

## using it

everyone uses their code on both sides of the page. it's the same code.

**left side** - you're giving gifts:
- enter your code
- see who you're buying for
- write 3 hints and hide your code

**right side** - you're receiving gifts:
- enter your code
- see 3 hints from whoever is buying for you
- find the gifts and find the hidden code

once you have their code (from the hidden paper), enter it in the reveal box on the left to find out who your secret santa was.

## customizing

change participants by editing `PARTICIPANT_NAMES` in `server.js`:

```javascript
const PARTICIPANT_NAMES = ['name1', 'name2', 'name3'];
```

## notes

- same code on both sides
- hint 3 is where you hide the paper with your code
- code needs to be written down and physically hidden
- everyone gets regenerated codes each time
- admin can see everything but also participates as a regular person

