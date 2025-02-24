
let citiesData = [];
let currentSchedule = [];
const adhanAudio = new Audio('https://www.islamicfinder.org/media/adhan/Mishary Rashid Alafasy.mp3'); // Replace with your Adhan URL

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; jadwal-sholat/1.0)" } });
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
          else reject(new Error("Tidak ditemukan kota yang cocok"));
        } else reject(new Error("Data reverse geocode kosong"));
      },
      (error) => reject(error)
    );
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

  initializeYearSelect(currentYear);
  initializeMonthSelect();
  await loadCities();

  document.getElementById("yearSelect").value = currentYear;
  document.getElementById("monthSelect").value = currentMonth;

  $('#yearSelect').select2({ placeholder: "Pilih Tahun", allowClear: true, width: '100%' });
  $('#monthSelect').select2({ placeholder: "Pilih Bulan", allowClear: true, width: '100%' });
  $('#citySelect').select2({ placeholder: "Pilih Kota/Kabupaten", allowClear: true, width: '100%' });

  try {
    const cityId = await getUserLocation();
    $("#citySelect").val(cityId).trigger('change');
  } catch (error) {
    console.log('Default ke Bekasi:', error);
    $("#citySelect").val("1221").trigger('change');
  }

  document.getElementById("selectedInfo").addEventListener("click", toggleSelectionModal);
  document.getElementById("applySelection").addEventListener("click", handleSelectionChange);
  document.querySelectorAll('.view-option').forEach(button => button.addEventListener('click', handleViewModeChange));
  setTheme();
  handleSelectionChange(true); // Default to daily view on load
  checkPrayerTime();
  updateCountdowns();

  // Listen for changes in prefers-color-scheme dynamically
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    setTheme(e.matches ? 'dark' : 'light');
  });
});

function setTheme(theme = null) {
  const prefersDarkScheme = theme === 'dark' || window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", prefersDarkScheme ? "dark" : "light");
}

function initializeYearSelect(startYear) {
  const yearSelect = document.getElementById("yearSelect");
  for (let year = startYear; year <= startYear + 5; year++) {
    yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
  }
}

function initializeMonthSelect() {
  const monthSelect = document.getElementById("monthSelect");
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  months.forEach((name, index) => {
    monthSelect.innerHTML += `<option value="${String(index + 1).padStart(2, '0')}">${name}</option>`;
  });
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

function toggleSelectionModal() {
  const modal = document.getElementById("selectionModal");
  const overlay = document.getElementById("modalOverlay");
  modal.style.display = "block";
  overlay.style.display = "block";
  overlay.onclick = () => {
    modal.style.display = "none";
    overlay.style.display = "none";
  };
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
  const year = document.getElementById("yearSelect").value;
  const month = document.getElementById("monthSelect").value;
  const citySelect = document.getElementById("citySelect");
  const cityId = citySelect.value;
  const cityName = citySelect.options[citySelect.selectedIndex]?.text || "";
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const monthName = months[parseInt(month) - 1];
  document.getElementById("selectedInfo").textContent = `Jadwal Sholat untuk ${cityName} dan Sekitarnya ${daily ? `Tanggal ${new Date().getDate()} ${monthName} ${year}` : `Bulan ${monthName} Tahun ${year}`}`;

  if (year && month && cityId) await fetchPrayerTimes(cityId, year, month, daily);

  document.getElementById("selectionModal").style.display = "none";
  document.getElementById("modalOverlay").style.display = "none";
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
      { name: "Imsak", time: todaySchedule.imsak },
      { name: "Subuh", time: todaySchedule.subuh },
      { name: "Terbit", time: todaySchedule.terbit },
      { name: "Dhuha", time: todaySchedule.dhuha },
      { name: "Dzuhur", time: todaySchedule.dzuhur },
      { name: "Ashar", time: todaySchedule.ashar },
      { name: "Maghrib", time: todaySchedule.maghrib },
      { name: "Isya", time: todaySchedule.isya }
    ];
    let html = `
      <h3 class="text-center mb-3" style="color: var(--text-color); animation: fadeIn 1s ease-out;">${formattedDate}</h3>
      ${prayers.map(prayer => `
        <div class="daily-item">
          <div class="daily-name">${prayer.name}</div>
          <div class="d-flex align-items-center">
            <div class="daily-time">${prayer.time}</div>
            ${isPastPrayer(prayer.time) ? '<i class="fas fa-check checkmark ms-2"></i>' : ''}
            <i class="fas fa-volume-up adhan-icon ms-2" onclick="playAdhan('${prayer.time}')"></i>
            <div class="daily-countdown ms-2" id="countdown-${prayer.name}"></div>
          </div>
        </div>
      `).join('')}
    `;
    container.innerHTML = html;
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
    const prayers = [
      { name: "Imsak", time: currentSchedule[0]?.imsak || "05:11" },
      { name: "Subuh", time: currentSchedule[0]?.subuh || "05:21" },
      { name: "Terbit", time: currentSchedule[0]?.terbit || "06:35" },
      { name: "Dhuha", time: currentSchedule[0]?.dhuha || "07:57" },
      { name: "Dzuhur", time: currentSchedule[0]?.dzuhur || "12:41" },
      { name: "Ashar", time: currentSchedule[0]?.ashar || "15:58" },
      { name: "Maghrib", time: currentSchedule[0]?.maghrib || "18:41" },
      { name: "Isya", time: currentSchedule[0]?.isya || "19:51" }
    ];
    prayers.forEach(prayer => {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerTime = new Date(now);
      prayerTime.setHours(hours, minutes, 0, 0);
      if (now < prayerTime) {
        const diffMs = prayerTime - now;
        const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
        const minutesLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const secondsLeft = Math.floor((diffMs % (1000 * 60)) / 1000);
        document.getElementById(`countdown-${prayer.name}`).textContent = `-${hoursLeft}:${minutesLeft}:${secondsLeft}`;
      } else {
        document.getElementById(`countdown-${prayer.name}`).textContent = "";
      }
    });
  }, 1000);
}

function playAdhan(timeStr) {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const prayerTime = new Date(now);
  prayerTime.setHours(hours, minutes, 0, 0);
  if (Math.abs(now - prayerTime) < 60000) { // Within 1 minute of prayer time
    adhanAudio.play();
  }
}

function checkPrayerTime() {
  setInterval(() => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = String(now.getDate()).padStart(2, '0');
    const year = document.getElementById("yearSelect").value;
    const month = document.getElementById("monthSelect").value;
    if (currentSchedule.length > 0 && year == now.getFullYear() && month == String(now.getMonth() + 1).padStart(2, '0')) {
      const todaySchedule = currentSchedule.find(day => {
        const match = day.tanggal.match(/\d+/);
        return match && match[0] === currentDay;
      });
      if (todaySchedule) {
        const prayerTimes = {
          "Subuh": todaySchedule.subuh,
          "Dzuhur": todaySchedule.dzuhur,
          "Ashar": todaySchedule.ashar,
          "Maghrib": todaySchedule.maghrib,
          "Isya": todaySchedule.isya,
          "Imsak": todaySchedule.imsak,
          "Terbit": todaySchedule.terbit,
          "Dhuha": todaySchedule.dhuha
        };
        for (const [prayer, time] of Object.entries(prayerTimes)) {
          if (currentTime === time) {
            adhanAudio.play();
            document.getElementById("adhanNotification").style.display = "block";
            setTimeout(() => document.getElementById("adhanNotification").style.display = "none", 60000); // Hide after 1 minute
            break;
          }
        }
      }
    }
  }, 60000); // Check every minute
}
