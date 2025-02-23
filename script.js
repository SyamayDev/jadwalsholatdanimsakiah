let citiesData = [];
let currentSchedule = [];
let audioAllowed = false; // Status izin audio

const adzanSubuhAudio = new Audio('adzansubuh.mp3');
const semuaAdzanAudio = new Audio('semuaadzan.mp3');
const imsakAudio = new Audio('waktuimsaktelahtiba.mp3');
let isPlaying = false;
let currentAudio = null;

// Pop-up untuk meminta izin audio saat halaman dimuat
document.addEventListener("DOMContentLoaded", async function () {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

  // Tampilkan pop-up untuk meminta izin audio
  audioAllowed = confirm("Aplikasi ini akan memainkan audio adzan secara otomatis pada waktu sholat. Izinkan audio untuk memulai?");
  if (!audioAllowed) {
    alert("Audio akan dimatikan. Anda dapat mengaktifkannya secara manual dengan menekan ikon speaker.");
  }

  await loadCities();

  $('#citySelect').select2({ placeholder: "Pilih Kota/Kabupaten", allowClear: true, width: '100%' });

  try {
    const cityId = await getUserLocation();
    $("#citySelect").val(cityId).trigger('change');
  } catch (error) {
    console.log('Default ke Bekasi:', error);
    $("#citySelect").val("1221").trigger('change');
  }

  document.querySelectorAll('.view-option').forEach(button => button.addEventListener('click', handleViewModeChange));
  $("#citySelect").on('change', () => handleSelectionChange(true)); // Update on city change
  setTheme();
  handleSelectionChange(true); // Default to daily view on load
  checkPrayerTime();
  updateCountdowns();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    setTheme(e.matches ? 'dark' : 'light');
  });
});

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; jadwal-sholat/1.0; email@example.com)" },
      mode: 'cors'
    });
    if (!response.ok) throw new Error("Reverse geocoding error " + response.status);
    const data = await response.json();
    return data.address?.county || data.address?.city || data.address?.town || null;
  } catch (err) {
    console.error("Reverse geocoding error:", err);
    return null;
  }
}

function normalizeName(name) {
  return name.toUpperCase().replace(/^(CITY OF\s+|KOTA\s+|KAB\.\s+)/, "").trim();
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation tidak didukung'));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const candidateName = await reverseGeocode(latitude, longitude);
          if (candidateName && citiesData.length > 0) {
            const candidateNormalized = normalizeName(candidateName);
            const exactMatches = citiesData.filter(city => normalizeName(city.lokasi) === candidateNormalized);
            if (exactMatches.length > 0) return resolve(exactMatches[0].id);
            const substringMatches = citiesData.filter(city => {
              const lokasiNormalized = normalizeName(city.lokasi);
              return lokasiNormalized.includes(candidateNormalized) || candidateNormalized.includes(lokasiNormalized);
            });
            if (substringMatches.length > 0) resolve(substringMatches[0].id);
            else resolve("1221"); // Default ke Bekasi
          } else resolve("1221");
        } catch (error) {
          console.log('Gagal reverse geocoding, default ke Bekasi:', error);
          resolve("1221");
        }
      },
      (error) => {
        console.log('Gagal mendapatkan lokasi, default ke Bekasi:', error);
        resolve("1221");
      }
    );
  });
}

function setTheme(theme = null) {
  const prefersDarkScheme = theme === 'dark' || window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", prefersDarkScheme ? "dark" : "light");
}

async function loadCities() {
  const citySelect = document.getElementById("citySelect");
  try {
    const response = await fetch("https://api.myquran.com/v2/sholat/kota/semua");
    const data = await response.json();
    citiesData = data.data;
    citySelect.innerHTML = "";
    data.data.forEach(city => {
      citySelect.innerHTML += `<option value="${city.id}">${city.lokasi}</option>`;
    });
  } catch (error) {
    console.error("Gagal mengambil daftar kota:", error);
  }
}

function handleViewModeChange(e) {
  const viewMode = e.target.getAttribute('data-view');
  const monthlyTable = document.getElementById("monthlyTable");
  const dailySchedule = document.getElementById("dailySchedule");
  const buttons = document.querySelectorAll('.view-option');

  buttons.forEach(btn => btn.style.background = 'var(--bg-color)');
  buttons.forEach(btn => btn.style.color = 'var(--text-color)');
  e.target.style.background = 'var(--header-bg-color)';
  e.target.style.color = 'var(--header-text-color)';

  if (viewMode === "monthly") {
    monthlyTable.style.display = "block";
    dailySchedule.style.display = "none";
    handleSelectionChange(false);
  } else {
    monthlyTable.style.display = "none";
    dailySchedule.style.display = "block";
    handleSelectionChange(true);
  }
}

async function handleSelectionChange(daily = false) {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const cityId = document.getElementById("citySelect").value;
  const cityName = $("#citySelect").find(':selected').text() || "";
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const monthName = months[parseInt(month) - 1];
  const selectedInfo = document.getElementById("selectedInfo");
  selectedInfo.textContent = `Jadwal Sholat untuk ${cityName} dan Sekitarnya ${daily ? `Tanggal ${today.getDate()} ${monthName} ${year}` : `Bulan ${monthName} Tahun ${year}`}`;

  if (cityId) await fetchPrayerTimes(cityId, year, month, daily);
}

async function fetchPrayerTimes(cityId, year, month, daily = false) {
  try {
    document.getElementById("loadingIndicator").style.display = "block";
    const response = await fetch(`https://api.myquran.com/v2/sholat/jadwal/${cityId}/${year}/${month}`);
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const data = await response.json();
    if (data.status) {
      currentSchedule = data.data.jadwal;
      if (daily) displayDailySchedule(data.data.jadwal);
      else displaySchedule(data.data.jadwal);
    } else throw new Error("Data tidak tersedia");
  } catch (error) {
    console.error("Error fetching jadwal:", error);
    alert("Terjadi kesalahan saat mengambil jadwal sholat");
  } finally {
    document.getElementById("loadingIndicator").style.display = "none";
  }
}

function displaySchedule(schedule) {
  const container = document.getElementById("scheduleContainer");
  container.innerHTML = "";
  const today = new Date();
  const formattedToday = today.getDate();
  schedule.forEach(day => {
    const match = day.tanggal.match(/\d+/);
    const dayNumber = match ? parseInt(match[0]) : NaN;
    const isToday = dayNumber === formattedToday;
    container.innerHTML += `
      <tr class="${isToday ? 'highlight-today' : ''}">
        <td>${day.tanggal}</td>
        <td>${day.imsak}</td>
        <td>${day.subuh}</td>
        <td>${day.terbit}</td>
        <td>${day.dhuha}</td>
        <td>${day.dzuhur}</td>
        <td>${day.ashar}</td>
        <td>${day.maghrib}</td>
        <td>${day.isya}</td>
      </tr>`;
  });
}

function displayDailySchedule(schedule) {
  const container = document.getElementById("dailySchedule");
  const today = new Date();
  const formattedToday = String(today.getDate()).padStart(2, '0');
  const todaySchedule = schedule.find(day => {
    const match = day.tanggal.match(/\d+/);
    return match && match[0] === formattedToday;
  });
  if (todaySchedule) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dayName = days[today.getDay()];
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const monthName = monthNames[today.getMonth()];
    const year = today.getFullYear();
    const formattedDate = `Hari ini, ${dayName}, ${formattedToday} ${monthName} ${year}`;
    
    const prayers = [
      { name: "Imsak", time: todaySchedule.imsak, hasAudio: true },
      { name: "Subuh", time: todaySchedule.subuh, hasAudio: true },
      { name: "Terbit", time: todaySchedule.terbit, hasAudio: false },
      { name: "Dhuha", time: todaySchedule.dhuha, hasAudio: false },
      { name: "Dzuhur", time: todaySchedule.dzuhur, hasAudio: true },
      { name: "Ashar", time: todaySchedule.ashar, hasAudio: true },
      { name: "Maghrib", time: todaySchedule.maghrib, hasAudio: true },
      { name: "Isya", time: todaySchedule.isya, hasAudio: true }
    ];
    let html = `
      <marquee class="marquee" id="adhanNotification" style="display: none;">Waktu imsak telah tiba, menandakan dimulainya ibadah puasa kita hari ini. Saatnya menahan diri dari makan, minum, serta segala hal yang dapat membatalkan puasa. Namun, lebih dari sekadar menahan lapar dan dahaga, puasa juga mengajarkan kita untuk menjaga lisan, menahan amarah, memperbanyak doa, dan meningkatkan ibadah kepada Allah SWT. Semoga di hari yang penuh berkah ini, kita diberikan kekuatan dan kesabaran dalam menjalankan ibadah puasa. Mari kita manfaatkan waktu ini untuk semakin mendekatkan diri kepada-Nya, memperbanyak dzikir, membaca Al-Qur'an, serta memperbaiki akhlak kita. Semoga puasa kita diterima dan membawa keberkahan bagi kehidupan kita. Aamiin.</marquee>
      <h3 class="text-center mb-3" style="color: var(--text-color); animation: fadeIn 1s ease-out;">${formattedDate}</h3>
      ${prayers.map(prayer => `
        <div class="daily-item">
          <div class="daily-name">${prayer.name}</div>
          <div class="d-flex align-items-center">
            <div class="daily-time">${prayer.time}</div>
            ${isPastPrayer(prayer.time) ? '<i class="fas fa-check checkmark ms-2"></i>' : ''}
            <i class="fas ${prayer.hasAudio ? 'fa-volume-up adhan-icon' : 'fa-volume-mute adhan-icon no-audio'} ms-2" data-prayer="${prayer.name}" data-time="${prayer.time}"></i>
            <div class="daily-countdown ms-2" id="countdown-${prayer.name}"></div>
          </div>
        </div>
      `).join('')}
    `;
    container.innerHTML = html;

    document.querySelectorAll('.adhan-icon').forEach(icon => {
      if (!icon.classList.contains('no-audio')) { // Hanya tambahkan event listener untuk ikon dengan audio
        icon.addEventListener('click', (e) => {
          const prayerName = icon.getAttribute('data-prayer');
          const time = icon.getAttribute('data-time');
          toggleAudio(prayerName, time, icon);
        });
      }
    });
  }
}

function isPastPrayer(timeStr) {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const prayerTime = new Date(now);
  prayerTime.setHours(hours, minutes, 0, 0);
  return now > prayerTime;
}

function updateCountdowns() {
  setInterval(() => {
    const now = new Date();
    const today = new Date();
    const formattedToday = String(today.getDate()).padStart(2, '0');
    const todaySchedule = currentSchedule.find(day => {
      const match = day.tanggal.match(/\d+/);
      return match && match[0] === formattedToday;
    });

    if (todaySchedule) {
      const prayers = [
        { name: "Imsak", time: todaySchedule.imsak },
        { name: "Subuh", time: todaySchedule.subuh },
        { name: "Terbit", time: todaySchedule.terbit },
        { name: "Dhuha", time: todaySchedule.dhuha },
        { name: "Dzuhur", time: todaySchedule.dzuhur },
        { name: "Ashar", time: todaySchedule.ashar },
        { name: "Maghrib", time: todaySchedule.maghrib },
        { name: "Isya", time: todaySchedule.isya }
      ];

      // Urutkan sholat berdasarkan waktu
      prayers.sort((a, b) => {
        const [aHours, aMinutes] = a.time.split(':').map(Number);
        const [bHours, bMinutes] = b.time.split(':').map(Number);
        return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
      });

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      let nextPrayer = null;

      for (const prayer of prayers) {
        const [hours, minutes] = prayer.time.split(':').map(Number);
        const prayerMinutes = hours * 60 + minutes;
        
        // Periksa jika sholat berikutnya ada di hari yang sama
        if (prayerMinutes > currentMinutes) {
          nextPrayer = prayer;
          break;
        }
      }

      // Jika tidak ada sholat berikutnya hari ini, pilih Imsak hari berikutnya
      if (!nextPrayer) {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowFormatted = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowSchedule = currentSchedule.find(day => {
          const match = day.tanggal.match(/\d+/);
          return match && match[0] === tomorrowFormatted;
        });
        if (tomorrowSchedule) {
          nextPrayer = { name: "Imsak", time: tomorrowSchedule.imsak };
        }
      }

      if (nextPrayer) {
        const [hours, minutes] = nextPrayer.time.split(':').map(Number);
        const prayerTime = new Date(now);
        prayerTime.setHours(hours, minutes, 0, 0);

        // Pastikan perbandingan waktu menggunakan zona waktu yang sama
        if (now < prayerTime) {
          const diffMs = prayerTime - now;
          const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
          const minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          const secondsLeft = Math.floor((diffMs % (1000 * 60)) / 1000);
          
          // Tampilkan countdown dengan format yang konsisten (misalnya, 0:02:00 untuk 2 menit)
          document.getElementById(`countdown-${nextPrayer.name}`).textContent = 
            `${hoursLeft.toString().padStart(1, '0')}:${minutesLeft.toString().padStart(2, '0')}:${secondsLeft.toString().padStart(2, '0')}`;
        } else {
          document.getElementById(`countdown-${nextPrayer.name}`).textContent = "";
        }
      } else {
        prayers.forEach(prayer => {
          document.getElementById(`countdown-${prayer.name}`).textContent = "";
        });
      }
    }
  }, 1000); // Update every second
}

function toggleAudio(prayerName, timeStr, icon) {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const prayerTime = new Date(now);
  prayerTime.setHours(hours, minutes, 0, 0);

  if (now.getHours() === prayerTime.getHours() && now.getMinutes() === prayerTime.getMinutes()) {
    if (!audioAllowed) {
      alert("Silakan izinkan audio melalui pop-up untuk memainkan suara.");
      return;
    }

    if (isPlaying && currentAudio) {
      if (currentAudio.muted) {
        currentAudio.muted = false;
        icon.classList.remove('muted');
        icon.classList.add('playing');
      } else {
        currentAudio.muted = true;
        icon.classList.remove('playing');
        icon.classList.add('muted');
      }
      return;
    }

    stopAllAudio();
    let audioToPlay = null;
    if (prayerName === "Imsak") {
      audioToPlay = imsakAudio;
    } else if (prayerName === "Subuh") {
      audioToPlay = adzanSubuhAudio;
    } else if (prayerName !== "Terbit" && prayerName !== "Dhuha") {
      audioToPlay = semuaAdzanAudio;
    }

    if (audioToPlay) {
      try {
        audioToPlay.play();
        currentAudio = audioToPlay;
        icon.classList.add('playing');
        isPlaying = true;
        audioToPlay.onended = () => {
          icon.classList.remove('playing');
          isPlaying = false;
          currentAudio = null;
        };
      } catch (error) {
        console.error(`Error playing ${prayerName} audio:`, error);
        alert("Gagal memutar audio. Pastikan Anda telah mengizinkan audio dan browser tidak memblokir pemutaran.");
      }
    }
  }
}

function stopAllAudio() {
  [imsakAudio, adzanSubuhAudio, semuaAdzanAudio].forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
  });
  document.querySelectorAll('.adhan-icon').forEach(icon => {
    icon.classList.remove('playing', 'muted');
  });
  isPlaying = false;
  currentAudio = null;
}

function checkPrayerTime() {
  setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    if (currentSchedule.length > 0) {
      const todaySchedule = currentSchedule.find(day => {
        const match = day.tanggal.match(/\d+/);
        return match && match[0] === currentDay;
      });
      if (todaySchedule) {
        const prayerTimes = {
          "Imsak": todaySchedule.imsak,
          "Subuh": todaySchedule.subuh,
          "Terbit": todaySchedule.terbit,
          "Dhuha": todaySchedule.dhuha,
          "Dzuhur": todaySchedule.dzuhur,
          "Ashar": todaySchedule.ashar,
          "Maghrib": todaySchedule.maghrib,
          "Isya": todaySchedule.isya
        };
        for (const [prayer, time] of Object.entries(prayerTimes)) {
          if (currentTime === time) {
            // Hanya tampilkan notifikasi tanpa memutar audio otomatis
            if (prayer === "Imsak") {
              document.getElementById("adhanNotification").textContent = "Waktu imsak telah tiba, menandakan dimulainya ibadah puasa kita hari ini.";
            } else if (prayer === "Subuh") {
              document.getElementById("adhanNotification").textContent = "Waktu Subuh Telah Tiba";
            } else if (prayer !== "Terbit" && prayer !== "Dhuha") {
              document.getElementById("adhanNotification").textContent = `Waktu ${prayer} Telah Tiba`;
            }
            const marquee = document.getElementById("adhanNotification");
            marquee.style.display = "block";
            marquee.style.animation = "none"; // Hentikan animasi sementara
            marquee.offsetHeight; // Trigger reflow
            marquee.style.animation = "slideBox 15s ease-in-out infinite"; // Mulai ulang animasi
            break;
          } else {
            document.getElementById("adhanNotification").style.display = "none";
          }
        }
      }
    }
  }, 60000);
}