const dns = require('dns').promises;
const net = require('net');

/**
 * Danh sách các tên miền email tạm thời / email ảo (Disposable Email Providers)
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'temp-mail.ru',
  '10minutemail.com',
  '10minutemail.net',
  '10minmail.com',
  'minutemail.com',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'cool.fr.nf',
  'jetable.fr.nf',
  'courriel.fr.nf',
  'moncourrier.fr.nf',
  'dispostable.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'trashmail.org',
  'getairmail.com',
  'mohmal.com',
  'burnermail.io',
  'fakemailgenerator.com',
  'emailondeck.com',
  'inboxbear.com',
  'generator.email',
  'crazymailing.com',
  'maildrop.cc',
  'mytemp.email',
  'harakirimail.com',
  'tmail.ws',
  'trash-mail.com',
  'tempail.com',
  'boun.cr',
  'crazymail.com',
  'nada.ltd',
  'getnada.com',
  'dropmail.me',
  'dayrep.com',
  'teleworm.us',
  'armyspy.com',
  'cuvox.de',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'chacuo.net',
  '0-mail.com',
  '0815.ru',
  '0clickemail.com',
  '0wnd.net',
  '0wnd.org',
  '10mail.org',
  '20minutemail.com',
  'anonbox.net',
  'anonymbox.com',
  'antichef.com',
  'antichef.net',
  'binkmail.com',
  'bobmail.info',
  'bodhi.lawlita.com',
  'bofthew.com',
  'bugmenot.com',
  'bupkis.org',
  'casualdx.com',
  'discard.email',
  'discardmail.com',
  'disposablemail.com',
  'dodgeit.com',
  'drdrb.net',
  'emailgo.de',
  'emailproxsy.com',
  'emailsensei.com',
  'emailtemporaneo.net',
  'fakeinbox.com',
  'filzmail.com',
  'front14.org',
  'getnada.com',
  'hidemail.de',
  'incognitmail.com',
  'inboxclean.com',
  'kasmail.com',
  'mail-temporaire.fr',
  'mailcatch.com',
  'mailexpire.com',
  'mailforspam.com',
  'mailmoat.com',
  'mailnull.com',
  'meltmail.com',
  'no-spam.ws',
  'nomail.xl.cx',
  'nospam.ze.tc',
  'oneoffmail.com',
  'pookmail.com',
  'quickinbox.com',
  'safersignup.com',
  'shieldemail.com',
  'spambog.com',
  'spamevader.com',
  'spamfree24.org',
  'spaml.com',
  'spamspot.com',
  'spamtrap.ro',
  'tempemail.net',
  'throwawayemailaddress.com',
  'trbvm.com',
  'uggsrock.com',
  'veryrealemail.com',
  'zoemail.com'
]);

/**
 * Kiểm tra xem tên miền có thuộc danh sách email ảo / tạm thời không
 */
function isDisposableEmail(domain) {
  if (!domain) return false;
  const lowerDomain = domain.toLowerCase().trim();

  // 1. Kiểm tra trong danh sách domain
  if (DISPOSABLE_DOMAINS.has(lowerDomain)) return true;

  // 2. Kiểm tra các mẫu từ khoá đặc trưng của email ảo
  const suspiciousKeywords = [
    'tempmail',
    'temp-mail',
    'disposable',
    'throwaway',
    'fake-mail',
    'fakemail',
    '10minute',
    '20minute',
    'trashmail',
    'mailinator',
    'guerrillamail',
    'yopmail'
  ];

  for (const kw of suspiciousKeywords) {
    if (lowerDomain.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Kiểm tra xem tên miền có bản ghi MX (Mail Exchange) hợp lệ không
 */
async function hasValidMxRecords(domain) {
  try {
    const mxRecords = await dns.resolveMx(domain);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (err) {
    // Nếu không tìm thấy bản ghi MX hoặc tên miền không tồn tại
    if (['ENOTFOUND', 'NODATA', 'SERVFAIL'].includes(err.code)) {
      return false;
    }
    // Fallback thử kiểm tra bản ghi A (IPv4)
    try {
      const aRecords = await dns.resolve4(domain);
      return Array.isArray(aRecords) && aRecords.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Kết nối trực tiếp tới máy chủ Google SMTP (gmail-smtp-in.l.google.com:25)
 * để kiểm tra xem tài khoản Gmail có thực sự tồn tại hay không.
 */
function verifyGmailAddress(email, senderUser = 'sandundertailroal@gmail.com', timeoutMs = 4500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        try {
          socket.destroy();
        } catch {}
        resolve(result);
      }
    };

    const socket = net.createConnection(25, 'gmail-smtp-in.l.google.com');
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs);

    let step = 0; // 0: chờ 220, 1: chờ 250 sau EHLO, 2: chờ 250 sau MAIL FROM, 3: chờ response RCPT TO

    socket.on('connect', () => {});

    socket.on('data', (chunk) => {
      const text = chunk.trim();

      if (step === 0 && text.startsWith('220')) {
        step = 1;
        socket.write('EHLO nexora.local\r\n');
      } else if (step === 1 && text.startsWith('250')) {
        step = 2;
        socket.write(`MAIL FROM:<${senderUser}>\r\n`);
      } else if (step === 2 && text.startsWith('250')) {
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        const code = text.slice(0, 3);
        if (code === '550' || text.includes('5.1.1') || text.includes('does not exist') || text.includes('NoSuchUser')) {
          // Gmail phản hồi tài khoản không tồn tại
          finish({ exists: false, error: 'Địa chỉ Gmail này không tồn tại.' });
        } else if (code === '250') {
          // Gmail phản hồi tài khoản hợp lệ
          finish({ exists: true });
        } else {
          // Phản hồi khác (421, 450 rate limit, v.v.), không kết luận là không tồn tại
          finish({ exists: null, fallback: true, response: text });
        }
      }
    });

    socket.on('error', (err) => {
      // Nếu port 25 bị chặn (ví dụ trên môi trường cloud), trả về fallback để tiếp tục kiểm tra qua Nodemailer
      finish({ exists: null, fallback: true, error: err.message });
    });

    socket.on('timeout', () => {
      finish({ exists: null, fallback: true, error: 'Timeout khi kiểm tra Gmail' });
    });
  });
}

/**
 * Toàn diện kiểm tra tính hợp lệ và xác thực của Email:
 * 1. Định dạng chuẩn regex
 * 2. Phát hiện email ảo (Disposable email)
 * 3. Kiểm tra bản ghi DNS MX (Mail Exchange)
 * 4. Kiểm tra tài khoản Gmail thực tế qua Google SMTP
 */
async function validateEmailAuthenticity(email, senderUser = 'sandundertailroal@gmail.com') {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Địa chỉ email không được để trống.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleanEmail)) {
    return { valid: false, error: 'Định dạng email không hợp lệ.' };
  }

  const parts = cleanEmail.split('@');
  if (parts.length !== 2) {
    return { valid: false, error: 'Định dạng email không hợp lệ.' };
  }

  const domain = parts[1];

  // 1. Kiểm tra email ảo / tạm thời (Disposable Email)
  if (isDisposableEmail(domain)) {
    return {
      valid: false,
      error: 'Hệ thống không chấp nhận email ảo (email tạm thời). Vui lòng sử dụng địa chỉ email thật (Gmail, Outlook, Yahoo...) để đăng ký.'
    };
  }

  // 2. Kiểm tra bản ghi MX của tên miền email
  const hasMx = await hasValidMxRecords(domain);
  if (!hasMx) {
    return {
      valid: false,
      error: 'Tên miền email không tồn tại hoặc không thể nhận thư. Vui lòng kiểm tra lại email của bạn.'
    };
  }

  // 3. Nếu là Gmail (@gmail.com hoặc @googlemail.com), kiểm tra sự tồn tại thực tế của hòm thư
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const gmailCheck = await verifyGmailAddress(cleanEmail, senderUser);
    if (gmailCheck.exists === false) {
      return {
        valid: false,
        error: 'Địa chỉ Gmail này không tồn tại. Vui lòng kiểm tra lại địa chỉ email của bạn.'
      };
    }
  }

  return { valid: true, email: cleanEmail };
}

module.exports = {
  isDisposableEmail,
  hasValidMxRecords,
  verifyGmailAddress,
  validateEmailAuthenticity
};
