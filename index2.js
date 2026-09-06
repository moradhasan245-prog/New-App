// Firebase Configuration
    const FIREBASE_DB_URL = "https://food-list-84d75-default-rtdb.europe-west1.firebasedatabase.app/";
    const firebaseConfig = {
        apiKey: "AIzaSyDummyKeyForConnectionSetup12345",
        projectId: "food-list-84d75",
        databaseURL: FIREBASE_DB_URL
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.database();
    const appRef = db.ref();

    let peopleList = [];
    let isPaused = false;
    let leaveDates = [];
    let manualTodayIndex = null;
    let committeeList = [
        { name: "আলহাজ্ব মো: সভাপতি সাহেব", role: "সভাপতি", phone: "01700000000" },
        { name: "মো: সাধারণ সম্পাদক সাহেব", role: "সেক্রেটারি", phone: "01800000000" },
        { name: "সম্মানিত ইমাম সাহেব", role: "খতীব ও ইমাম", phone: "01900000000" }
    ];

    // Search and Filter States
    let searchQuery = "";
    let selectedRoleFilter = "ALL";
    let selectedMealFilter = "ALL";
    let filterTodayOnly = false;
    let isSearchOpen = false;

    // Navigation & Modal trackers
    let currentTab = 'homePage';
    let activeModal = null;
    let selectedDetailPerson = null;

    // Double-click exit tracker
    let lastBackPressTime = 0;
    let toastTimeout = null;

    const labelMap = {
        father: "পিতার নাম (গৃহপ্রধান)",
        son: "ছেলের নাম",
        role: "পদবী/পরিচয়",
        desc: "বিবরণ/ঠিকানা",
        phone: "ফোন নম্বর",
        mealType: "খাবারের ধরণ",
        notice: "বিশেষ নোটিশ"
    };

    window.onload = function() {
        loadSavedTheme();
        loadOfflineData();
        fetchFromFirebaseRest(); // Instant REST fetch (works in all WebViews)
        listenToFirebase();      // Realtime WebSocket listener
        setupHistoryBackHandler();
        checkFirstTimeUser();
        renderCommittee();

        // Background auto-sync every 40 seconds
        setInterval(fetchFromFirebaseRest, 40000);
    };

    // -----------------------------------------------------------
    // ১. প্রথমবার প্রবেশে স্বাগতম ও লাইভ ইউজার ট্র্যাকিং
    // -----------------------------------------------------------
    function checkFirstTimeUser() {
        const hasOnboarded = localStorage.getItem('imam_app_onboarded_v2');
        if (!hasOnboarded) {
            document.getElementById('onboardingModal').style.display = 'flex';
        } else {
            trackUserActivity(false);
        }
        listenToUserAnalytics();
    }

    function completeOnboarding() {
        localStorage.setItem('imam_app_onboarded_v2', 'true');
        document.getElementById('onboardingModal').style.display = 'none';
        trackUserActivity(true);
        showToast("স্বাগতম! অ্যাপে সফলভাবে প্রবেশ করেছেন");
    }

    function trackUserActivity(isNewUser) {
        let deviceId = localStorage.getItem('imam_device_id');
        if (!deviceId) {
            deviceId = 'USER_' + Math.random().toString(36).substring(2, 9).toUpperCase();
            localStorage.setItem('imam_device_id', deviceId);
        }

        const analyticsRef = db.ref('analytics');
        
        if (isNewUser) {
            analyticsRef.child('totalUsersCount').transaction((current) => (current || 0) + 1);
        }

        analyticsRef.child('totalSessions').transaction((current) => (current || 0) + 1);

        analyticsRef.child('devices').child(deviceId).set({
            lastActive: new Date().toISOString(),
            platform: navigator.userAgent.includes("Android") ? "Android App" : "Web",
            deviceId: deviceId
        }).catch(() => {});
    }

    function listenToUserAnalytics() {
        db.ref('analytics').on('value', (snap) => {
            const data = snap.val() || {};
            const totalUsers = data.totalUsersCount || (data.devices ? Object.keys(data.devices).length : 1);
            const totalVisits = data.totalSessions || 1;

            if (document.getElementById('analyticsUserCount')) {
                document.getElementById('analyticsUserCount').innerText = `${totalUsers} জন`;
            }
            if (document.getElementById('analyticsSessionCount')) {
                document.getElementById('analyticsSessionCount').innerText = `${totalVisits} বার`;
            }
            if (document.getElementById('analyticsDeviceId')) {
                const devId = localStorage.getItem('imam_device_id') || 'USER_ACT';
                document.getElementById('analyticsDeviceId').innerText = devId;
            }
        });
    }

    // -----------------------------------------------------------
    // ২. স্মার্ট ব্যাক বাটন এবং ডাবল ক্লিকে এক্সিট হ্যান্ডলিং
    // -----------------------------------------------------------
    function setupHistoryBackHandler() {
        history.replaceState({ tab: 'homePage', modal: null, search: false }, '');

        window.addEventListener('popstate', function(e) {
            if (activeModal) {
                closeModalDirectly(activeModal);
                return;
            }
            if (isSearchOpen) {
                closeSearchSection();
                return;
            }
            if (currentTab !== 'homePage') {
                switchTab('homePage', document.getElementById('nav-homePage'), false);
                return;
            }

            const currentTime = Date.now();
            if (currentTime - lastBackPressTime < 2000) {
                showToast("অ্যাপ থেকে বের হওয়া হচ্ছে...");
                history.back();
            } else {
                lastBackPressTime = currentTime;
                history.pushState({ tab: 'homePage', modal: null, search: false }, '');
                showToast("অ্যাপ থেকে বের হতে আবার ব্যাক বাটনে চাপুন");
            }
        });
    }

    function handleBackAction() {
        if (activeModal || isSearchOpen || currentTab !== 'homePage') {
            window.history.back();
        }
    }

    function showToast(msg, duration = 2000) {
        const toast = document.getElementById('toastNotification');
        const text = document.getElementById('toastMessage');
        text.innerText = msg;
        toast.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    function setTheme(themeName) {
        document.body.setAttribute('data-theme', themeName);
        localStorage.setItem('app_theme', themeName);
        document.querySelectorAll('.theme-circle').forEach(btn => btn.classList.remove('active'));
        showToast("থিম পরিবর্তন করা হয়েছে");
    }

    function loadSavedTheme() {
        const savedTheme = localStorage.getItem('app_theme') || 'default';
        setTheme(savedTheme);
    }

    function loadOfflineData() {
        const cached = localStorage.getItem('food_service_cache');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                peopleList = data.peopleList || [];
                isPaused = data.isPaused || false;
                leaveDates = data.leaveDates || [];
                manualTodayIndex = data.manualTodayIndex ?? null;
                if (data.committeeList) committeeList = data.committeeList;
                updateRoleFilterOptions();
                renderApp();
                renderCommittee();
                document.getElementById('syncStatusTag').innerText = "অফলাইন মোড";
                document.getElementById('syncStatusTag').style.color = "var(--accent-yellow)";
            } catch(e) {}
        }
    }

    function saveOfflineCache() {
        const cacheData = { peopleList, isPaused, leaveDates, manualTodayIndex, committeeList };
        localStorage.setItem('food_service_cache', JSON.stringify(cacheData));
    }

    // ফায়ারবেস ডিরেক্ট REST ফেচ (অ্যান্ড্রয়েড ওয়েবভিউ ও লোকাল অ্যাসেট ফোল্ডারে ১০০% কার্যকরী)
    async function fetchFromFirebaseRest() {
        try {
            const url = `${FIREBASE_DB_URL}.json?t=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    parseAndSetData(data);
                    const tag = document.getElementById('syncStatusTag');
                    if (tag) {
                        tag.innerText = "লাইভ সিঙ্কড";
                        tag.style.color = "var(--accent-green)";
                    }
                    return true;
                }
            }
        } catch(err) {
            console.warn("REST Sync Fallback Note:", err);
        }
        return false;
    }

    function listenToFirebase() {
        const tag = document.getElementById('syncStatusTag');
        if (tag && tag.innerText !== "লাইভ সিঙ্কড") {
            tag.innerText = "ডাটা আসছে...";
            tag.style.color = "var(--accent-yellow)";
        }

        try {
            appRef.on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    parseAndSetData(data);
                    if (tag) {
                        tag.innerText = "লাইভ সিঙ্কড";
                        tag.style.color = "var(--accent-green)";
                    }
                }
            }, (error) => {
                console.warn("Firebase WebSocket Notice:", error);
                // যদি ওয়েবভিউতে ওয়েবসকেট আটকে যায়, REST ফেচ ব্যাকআপ চালাবে
                fetchFromFirebaseRest();
            });
        } catch(e) {
            fetchFromFirebaseRest();
        }
    }

    function parseAndSetData(data) {
        if (!data) return;
        let list = [];

        if (data.peopleList) {
            list = Array.isArray(data.peopleList) ? data.peopleList : Object.values(data.peopleList);
        } else if (data.scheduleData && data.scheduleData.persons) {
            list = data.scheduleData.persons;
        } else {
            Object.keys(data).forEach(key => {
                const item = data[key];
                if (typeof item === 'object' && item !== null && (item['Father name'] || item.father || item.son)) {
                    list.push({
                        father: item['Father name'] || item.father || '',
                        son: item['Son name'] || item.son || '',
                        role: item['Role'] || item.role || '',
                        desc: item['Address'] || item.desc || '',
                        phone: item['Phone number'] || item.phone || item.mobile || '',
                        mealType: item['Meale_type'] || item.mealType || 'দুপুর ও রাত'
                    });
                }
            });
        }

        if (list.length > 0) {
            // ফিল্ডগুলো প্রমিতকরণ
            peopleList = list.map((p, idx) => ({
                id: p.id || (idx + 1),
                father: p.father || p['Father name'] || '',
                son: p.son || p['Son name'] || '',
                role: p.role || p['Role'] || 'সদস্য',
                desc: p.desc || p['Address'] || '',
                phone: p.phone || p.mobile || p['Phone number'] || '',
                mealType: p.mealType || p['Meale_type'] || 'দুপুর ও রাত'
            }));

            isPaused = typeof data.isPaused === 'boolean' ? data.isPaused : (data.scheduleData?.isPaused || false);
            leaveDates = Array.isArray(data.leaveDates) ? data.leaveDates : (data.scheduleData?.leaveDates || []);
            manualTodayIndex = (data.manualTodayIndex !== undefined && data.manualTodayIndex !== null) ? Number(data.manualTodayIndex) : (data.scheduleData?.manualTodayIndex ?? null);
            
            if (data.committeeList) {
                committeeList = Array.isArray(data.committeeList) ? data.committeeList : Object.values(data.committeeList);
            } else if (data.committeeMembers) {
                committeeList = data.committeeMembers;
            }

            saveOfflineCache();
            updateRoleFilterOptions();
            renderApp();
            renderCommittee();
        }
    }

    async function manualRefreshData() {
        const tag = document.getElementById('syncStatusTag');
        if (tag) {
            tag.innerText = "রিফ্রেশ হচ্ছে...";
            tag.style.color = "var(--accent-yellow)";
        }

        const success = await fetchFromFirebaseRest();
        if (success) {
            showToast("ফায়ারবেস থেকে ডাটা রিফ্রেশ সফল হয়েছে!");
        } else {
            try {
                appRef.once('value').then((snapshot) => {
                    const data = snapshot.val();
                    if (data) parseAndSetData(data);
                    if (tag) {
                        tag.innerText = "লাইভ সিঙ্কড";
                        tag.style.color = "var(--accent-green)";
                    }
                    showToast("ফায়ারবেস থেকে ডাটা রিফ্রেশ সফল হয়েছে!");
                }).catch(err => {
                    showToast("ডাটা রিফ্রেশ ব্যর্থ হয়েছে! ইন্টারনেট চেক করুন।");
                });
            } catch(err) {
                showToast("ইন্টারনেট সংযোগ চেক করুন");
            }
        }
    }

    function pushToFirebase() {
        saveOfflineCache();
        updateRoleFilterOptions();
        renderApp();
        renderCommittee();
        
        const payload = {
            peopleList: peopleList,
            isPaused: isPaused,
            leaveDates: leaveDates,
            manualTodayIndex: manualTodayIndex,
            committeeList: committeeList
        };

        // ১. ফায়ারবেস SDK পুশ
        try {
            if (appRef && typeof appRef.set === 'function') {
                appRef.set(payload).catch(err => console.warn("Firebase SDK save:", err));
            }
        } catch(e) {}

        // ২. ডিরেক্ট REST পুশ (অ্যান্ড্রয়েড ওয়েবভিউতে সার্বজনীন কাজ করবে)
        try {
            fetch(`${FIREBASE_DB_URL}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => {
                const tag = document.getElementById('syncStatusTag');
                if (tag) {
                    tag.innerText = "লাইভ সিঙ্কড";
                    tag.style.color = "var(--accent-green)";
                }
            }).catch(e => console.warn("REST patch save:", e));
        } catch(e) {}
    }

    // -----------------------------------------------------------
    // ৩. সার্চ ও ফিল্টারিং
    // -----------------------------------------------------------
    function toggleSearchSection() {
        if (isSearchOpen) {
            handleBackAction();
        } else {
            openSearchSection();
        }
    }

    function openSearchSection() {
        isSearchOpen = true;
        document.getElementById('searchFilterSection').classList.add('active');
        document.getElementById('searchToggleBtn').classList.add('active');
        history.pushState({ tab: currentTab, modal: null, search: true }, '');
        setTimeout(() => {
            document.getElementById('globalSearchInput').focus();
        }, 100);
    }

    function closeSearchSection() {
        isSearchOpen = false;
        document.getElementById('searchFilterSection').classList.remove('active');
        document.getElementById('searchToggleBtn').classList.remove('active');
    }

    function onSearchInput(val) {
        searchQuery = (val || "").trim().toLowerCase();
        document.getElementById('searchClearBtn').style.display = searchQuery.length > 0 ? 'block' : 'none';
        updateActiveFilterDot();
        renderApp();
    }

    function clearSearchInput() {
        const input = document.getElementById('globalSearchInput');
        input.value = '';
        onSearchInput('');
        input.focus();
    }

    function onRoleFilterChange(val) {
        selectedRoleFilter = val;
        updateActiveFilterDot();
        renderApp();
    }

    function onMealFilterChange(val) {
        selectedMealFilter = val;
        updateActiveFilterDot();
        renderApp();
    }

    function toggleTodayFilter() {
        filterTodayOnly = !filterTodayOnly;
        const btn = document.getElementById('chipTodayFilter');
        btn.classList.toggle('active', filterTodayOnly);
        updateActiveFilterDot();
        renderApp();
    }

    function resetAllFilters() {
        searchQuery = "";
        selectedRoleFilter = "ALL";
        selectedMealFilter = "ALL";
        filterTodayOnly = false;
        
        document.getElementById('globalSearchInput').value = "";
        document.getElementById('searchClearBtn').style.display = 'none';
        document.getElementById('roleFilterSelect').value = "ALL";
        document.getElementById('mealFilterSelect').value = "ALL";
        document.getElementById('chipTodayFilter').classList.remove('active');
        
        updateActiveFilterDot();
        renderApp();
        showToast("ফিল্টার রিসেট করা হয়েছে");
    }

    function updateActiveFilterDot() {
        const isFilterActive = searchQuery.length > 0 || selectedRoleFilter !== "ALL" || selectedMealFilter !== "ALL" || filterTodayOnly;
        document.getElementById('searchDot').style.display = isFilterActive ? 'block' : 'none';
    }

    function updateRoleFilterOptions() {
        const roleSelect = document.getElementById('roleFilterSelect');
        const currentVal = roleSelect.value;
        const rolesSet = new Set();

        peopleList.forEach(p => {
            if (p.role && p.role.trim() !== '') {
                rolesSet.add(p.role.trim());
            }
        });

        roleSelect.innerHTML = '<option value="ALL">সকল পদবী</option>';
        rolesSet.forEach(role => {
            const opt = document.createElement('option');
            opt.value = role;
            opt.innerText = role;
            roleSelect.appendChild(opt);
        });

        if (rolesSet.has(currentVal)) {
            roleSelect.value = currentVal;
        } else {
            roleSelect.value = "ALL";
            selectedRoleFilter = "ALL";
        }
    }

    function getFilteredPeople() {
        const todayIdx = getCurrentIndex();
        
        return peopleList.map((person, originalIndex) => ({
            person,
            originalIndex
        })).filter(({ person, originalIndex }) => {
            if (filterTodayOnly && originalIndex !== todayIdx) return false;
            if (selectedRoleFilter !== "ALL" && (person.role || '').trim() !== selectedRoleFilter) return false;
            if (selectedMealFilter !== "ALL") {
                const pMeal = (person.mealType || person['Meale_type'] || '').trim();
                if (!pMeal.includes(selectedMealFilter)) return false;
            }
            if (searchQuery.length > 0) {
                const valuesToSearch = Object.values(person).map(v => String(v || '').toLowerCase());
                valuesToSearch.push(String(originalIndex + 1));
                if (!valuesToSearch.some(valStr => valStr.includes(searchQuery))) return false;
            }
            return true;
        });
    }

    // -----------------------------------------------------------
    // ৪. রেন্ডারিং ও ক্যালকুলেশন
    // -----------------------------------------------------------
    function renderApp() {
        renderHero();
        renderHomeList();
        renderEditList();
        renderLeaves();
        updatePauseUI();
        
        const filteredList = getFilteredPeople();
        const isFiltering = searchQuery.length > 0 || selectedRoleFilter !== "ALL" || selectedMealFilter !== "ALL" || filterTodayOnly;
        
        if (isFiltering) {
            document.getElementById('totalHouseCount').innerText = `মিলছে: ${filteredList.length} / মোট: ${peopleList.length}`;
            document.getElementById('filterResultsCount').innerText = `ফলাফল: ${filteredList.length}টি বাড়ি`;
        } else {
            document.getElementById('totalHouseCount').innerText = `${peopleList.length}টি পরিবার`;
            document.getElementById('filterResultsCount').innerText = `মোট পরিবার: ${peopleList.length}`;
        }
    }

    function getCurrentIndex() {
        if (manualTodayIndex !== null && manualTodayIndex < peopleList.length) {
            return manualTodayIndex;
        }
        const today = new Date();
        const startDate = new Date('2026-01-01');
        const diffDays = Math.floor(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));
        return peopleList.length > 0 ? (diffDays % peopleList.length) : 0;
    }

    function renderHero() {
        const today = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        document.getElementById('heroDateText').innerText = today.toLocaleDateString('bn-BD', options);
        document.getElementById('topDateStr').innerText = today.toLocaleDateString('bn-BD', { month: 'short', day: 'numeric' });

        const dateStr = today.toISOString().split('T')[0];

        if (leaveDates.includes(dateStr)) {
            document.getElementById('heroFather').innerText = "আজ ছুটি";
            document.getElementById('heroSon').innerText = "খাবার বন্ধ থাকবে";
            document.getElementById('heroStatus').innerText = "ছুটি";
            document.getElementById('heroMeal').innerText = "• কার্যক্রম স্থগিত";
            document.getElementById('heroCallBtn').href = "tel:";
            return;
        }

        document.getElementById('heroStatus').innerText = isPaused ? "স্থগিত (Pause)" : "নিয়মিত";

        if(peopleList.length === 0) return;

        const index = getCurrentIndex();
        const tomorrowIndex = (index + 1) % peopleList.length;

        const current = peopleList[index] || { father: 'নেই', son: '', role: '', phone: '', mealType: 'তিন বেলা' };
        const tomorrow = peopleList[tomorrowIndex] || { father: 'নেই', son: '' };

        document.getElementById('heroFather').innerText = current.father || 'নামহীন';
        const roleTag = document.getElementById('heroRoleTag');
        if (current.desc || current.role) {
            roleTag.innerText = current.desc ? `${current.desc}${current.role && current.role !== 'সদস্য' ? ' • ' + current.role : ''}` : current.role;
            roleTag.style.display = 'inline-block';
        } else {
            roleTag.style.display = 'none';
        }

        document.getElementById('heroSon').innerText = current.son ? `ছেলে: ${current.son}` : 'ছেলে: নেই';
        document.getElementById('heroMeal').innerText = current.mealType ? `• ${current.mealType}` : '• তিন বেলা';

        if (current.phone) {
            document.getElementById('heroCallBtn').href = `tel:${current.phone}`;
            document.getElementById('heroCallBtn').style.opacity = "1";
        } else {
            document.getElementById('heroCallBtn').href = "#";
            document.getElementById('heroCallBtn').onclick = () => showToast("ফোন নম্বর যুক্ত নেই");
        }

        document.getElementById('tomorrowFather').innerText = tomorrow.father || 'নামহীন';
        document.getElementById('tomorrowSon').innerText = tomorrow.son ? `ছেলে: ${tomorrow.son}` : 'ছেলে: নেই';
    }

    function renderHomeList() {
        const container = document.getElementById('homeList');
        container.innerHTML = '';
        const activeIndex = getCurrentIndex();
        const filteredItems = getFilteredPeople();

        if (filteredItems.length === 0) {
            container.innerHTML = `
                <div class="empty-slate">
                    <div style="font-weight:700; margin-bottom:4px;">কোন তথ্য পাওয়া যায়নি</div>
                    <p style="font-size:0.75rem; margin-bottom:10px;">আপনার সার্চ বা ফিল্টারের সাথে মিলে এমন কোনো বাড়ি পাওয়া যায়নি।</p>
                    <button class="btn-ui" style="max-width:140px; margin:0 auto; padding:6px 10px; font-size:0.75rem;" onclick="resetAllFilters()">ফিল্টার রিসেট</button>
                </div>
            `;
            return;
        }

        filteredItems.forEach(({ person: item, originalIndex: idx }) => {
            const card = document.createElement('div');
            card.className = `house-card ${idx === activeIndex ? 'is-today' : ''}`;
            card.onclick = (e) => {
                if (e.target.closest('.call-icon-pill')) return;
                openDetailModal(idx);
            };
            
            const mealBadgeHtml = item.mealType ? `<span class="badge-meal">${item.mealType}</span>` : '';
            const phoneAction = item.phone ? `
                <a href="tel:${item.phone}" class="call-icon-pill" title="কল করুন" onclick="event.stopPropagation();">
                    <svg class="svg-icon" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                </a>
            ` : '';

            const bariBadgeHtml = item.desc ? `<span class="badge-role" style="background:var(--primary-soft); color:var(--primary);">${item.desc}</span>` : '';
            card.innerHTML = `
                <div class="house-left">
                    <div class="house-idx-box">${idx + 1}</div>
                    <div class="house-info">
                        <div class="house-title">
                            <span>${item.father || 'নামহীন'}</span>
                            ${bariBadgeHtml}
                            ${item.role ? `<span class="badge-role">${item.role}</span>` : ''}
                        </div>
                        <div class="house-meta-line">
                            <span class="badge-son">ছেলে: ${item.son || 'নেই'}</span>
                            ${mealBadgeHtml}
                        </div>
                    </div>
                </div>
                <div class="house-actions-right">
                    ${phoneAction}
                    <svg class="svg-icon" style="color:var(--text-muted); width:14px; height:14px;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderEditList() {
        const container = document.getElementById('editList');
        container.innerHTML = '';
        const activeIndex = getCurrentIndex();
        const filteredItems = getFilteredPeople();

        if (filteredItems.length === 0) {
            container.innerHTML = `
                <div class="empty-slate">
                    <div style="font-weight:700; margin-bottom:4px;">কোন তথ্য পাওয়া যায়নি</div>
                    <button class="btn-ui" style="max-width:140px; margin:8px auto 0; padding:6px 10px; font-size:0.75rem;" onclick="resetAllFilters()">ফিল্টার রিসেট</button>
                </div>
            `;
            return;
        }

        filteredItems.forEach(({ person: item, originalIndex: idx }) => {
            const card = document.createElement('div');
            card.className = `edit-card`;
            card.setAttribute('draggable', 'true');

            card.ondragstart = (e) => e.dataTransfer.setData('text/plain', idx);
            card.ondragover = (e) => e.preventDefault();
            card.ondrop = (e) => {
                e.preventDefault();
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                const movedItem = peopleList.splice(fromIdx, 1)[0];
                peopleList.splice(idx, 0, movedItem);
                pushToFirebase();
                showToast("তালিকার ক্রম পরিবর্তন হয়েছে");
            };

            let inputsHtml = '';
            Object.keys(item).forEach(key => {
                const label = labelMap[key] || key;
                const val = item[key] || '';
                inputsHtml += `
                    <div>
                        <label class="field-label">${label}</label>
                        <input type="text" class="input-text" value="${val}" onchange="updateData(${idx}, '${key}', this.value)" placeholder="${label}">
                    </div>
                `;
            });

            card.innerHTML = `
                <div class="edit-card-top">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span class="drag-grabber">⋮⋮</span>
                        <span style="font-weight:bold; font-size:0.82rem; color:var(--primary);">ক্রম: ${idx + 1}</span>
                        ${idx === activeIndex ? '<span style="font-size:0.65rem; background:var(--primary); color:white; padding:1px 6px; border-radius:6px;">আজকের মেহমানদারী</span>' : ''}
                    </div>
                    <div>
                        ${idx !== activeIndex ? `<button onclick="setManualToday(${idx})" style="background:var(--accent-green); color:white; border:none; padding:3px 6px; border-radius:5px; font-size:0.68rem; cursor:pointer; margin-right:4px;">আজ দিন</button>` : ''}
                        <button onclick="removePerson(${idx})" style="background:none; border:none; color:var(--accent-red); cursor:pointer;">
                            <svg class="svg-icon" style="width:16px; height:16px;" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
                    </div>
                </div>
                ${inputsHtml}
                <button onclick="addCustomFieldToCard(${idx})" class="btn-sm-outline" style="margin-top:4px;">+ নতুন কাস্টম তথ্য যোগ করুন</button>
            `;
            container.appendChild(card);
        });
    }

    function setManualToday(index) { 
        manualTodayIndex = index; 
        pushToFirebase();
        showToast("আজকের বাড়ি নির্ধারণ করা হয়েছে");
    }
    
    function updateData(index, field, val) { 
        peopleList[index][field] = val; 
        pushToFirebase(); 
    }

    function addCustomFieldToCard(index) {
        const fieldName = prompt("নতুন তথ্যের নাম লিখুন (যেমন: notice, bloodGroup):");
        if (fieldName && fieldName.trim() !== '') {
            peopleList[index][fieldName.trim()] = "";
            pushToFirebase();
        }
    }

    function removePerson(index) {
        if(confirm('এই সদস্যকে তালিকা থেকে মুছে ফেলতে চান?')) {
            peopleList.splice(index, 1);
            pushToFirebase();
            showToast("সদস্য মুছে ফেলা হয়েছে");
        }
    }

    // কমিটি রেন্ডারিং
    function renderCommittee() {
        const container = document.getElementById('committeeListContainer');
        if (!container) return;
        container.innerHTML = '';
        committeeList.forEach((member, i) => {
            const row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:var(--bg-color); padding:6px 8px; border-radius:7px; margin-bottom:5px; border:1px solid var(--border-color);";
            row.innerHTML = `
                <div>
                    <strong style="font-size:0.78rem; color:var(--text-main);">${member.name}</strong>
                    <span style="font-size:0.65rem; color:var(--primary); background:var(--primary-soft); padding:1px 5px; border-radius:4px; margin-left:4px;">${member.role}</span>
                    <div style="font-size:0.68rem; color:var(--text-sub);">${member.phone}</div>
                </div>
                <a href="tel:${member.phone}" style="background:var(--accent-green-soft); color:var(--accent-green); padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:700; text-decoration:none;">কল</a>
            `;
            container.appendChild(row);
        });
    }

    function openAddCommitteeModal() {
        const name = prompt("কমিটি সদস্যের নাম:");
        if (!name) return;
        const role = prompt("পদবী (যেমন: সভাপতি/সেক্রেটারি):", "সদস্য");
        const phone = prompt("মোবাইল নম্বর:", "01700000000");
        committeeList.push({ name, role: role || 'সদস্য', phone: phone || '' });
        pushToFirebase();
        showToast("কমিটি সদস্য যোগ হয়েছে");
    }

    // ডায়ালগ ওপেন এবং ক্লোজ (হিস্ট্রি সাপোর্টেড)
    function openDetailModal(index) {
        const item = peopleList[index];
        if (!item) return;
        selectedDetailPerson = item;

        document.getElementById('detailName').innerText = item.father || 'সদস্য';
        document.getElementById('detailRole').innerText = item.role || 'সাধারণ সদস্য';
        
        const container = document.getElementById('detailFieldsContainer');
        container.innerHTML = '';

        Object.keys(item).forEach(key => {
            if (key !== 'father' && key !== 'role') {
                const label = labelMap[key] || key;
                const val = item[key] || 'উল্লেখ নেই';
                container.innerHTML += `
                    <div class="detail-row-item">
                        <div class="detail-title-small">${label}</div>
                        <div class="detail-val-medium">${val}</div>
                    </div>
                `;
            }
        });

        const today = new Date();
        const activeIdx = getCurrentIndex();
        let daysDiff = (index - activeIdx + peopleList.length) % peopleList.length;
        
        const nextDate = new Date();
        nextDate.setDate(today.getDate() + daysDiff);
        const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        document.getElementById('detailNextDate').innerText = daysDiff === 0 ? "আজকে নির্ধারিত" : nextDate.toLocaleDateString('bn-BD', dateOptions);

        const modalCallBtn = document.getElementById('modalCallBtn');
        if (item.phone) {
            modalCallBtn.href = `tel:${item.phone}`;
            modalCallBtn.style.display = "flex";
        } else {
            modalCallBtn.style.display = "none";
        }

        activeModal = 'detailModal';
        document.getElementById('detailModal').style.display = 'flex';
        history.pushState({ tab: currentTab, modal: 'detailModal', search: false }, '');
    }

    function openAddModal() { 
        renderAddModalInputs();
        activeModal = 'addModal';
        document.getElementById('addModal').style.display = 'flex';
        history.pushState({ tab: currentTab, modal: 'addModal', search: false }, '');
    }

    function closeModalDirectly(modalId) {
        document.getElementById(modalId).style.display = 'none';
        activeModal = null;
    }

    function navigateToTab(pageId) {
        if (currentTab === pageId) return;
        switchTab(pageId, document.getElementById(`nav-${pageId}`), true);
    }

    function switchTab(pageId, navEl, pushHistory = true) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        
        document.getElementById(pageId).classList.add('active');
        if (navEl) navEl.classList.add('active');
        currentTab = pageId;

        document.getElementById('fabBtn').style.display = (pageId === 'editPage') ? 'flex' : 'none';

        if (pushHistory) {
            history.pushState({ tab: pageId, modal: null, search: false }, '');
        }
    }

    let newPersonStructure = {
        father: "",
        son: "",
        role: "সদস্য",
        desc: "",
        phone: "",
        mealType: "তিন বেলা"
    };

    function renderAddModalInputs() {
        const container = document.getElementById('addDynamicFields');
        container.innerHTML = '';
        Object.keys(newPersonStructure).forEach(key => {
            const label = labelMap[key] || key;
            container.innerHTML += `
                <div>
                    <label class="field-label">${label}</label>
                    <input type="text" id="add_field_${key}" class="input-text" value="${newPersonStructure[key]}" placeholder="${label} লিখুন...">
                </div>
            `;
        });
    }

    function addCustomFieldToAddModal() {
        const fieldName = prompt("নতুন কাস্টম তথ্যের নাম লিখুন:");
        if (fieldName && fieldName.trim() !== '') {
            newPersonStructure[fieldName.trim()] = "";
            renderAddModalInputs();
        }
    }

    function saveNewPerson() {
        const newObj = {};
        Object.keys(newPersonStructure).forEach(key => {
            const el = document.getElementById(`add_field_${key}`);
            if (el) {
                newObj[key] = el.value.trim();
            }
        });

        if(newObj.father) {
            peopleList.push(newObj);
            pushToFirebase();
            handleBackAction();
            showToast("নতুন সদস্য সফলভাবে যোগ হয়েছে!");
        } else {
            showToast("অনুগ্রহ করে অন্তত পিতার নাম প্রদান করুন");
        }
    }

    function copyDetailInfo() {
        if (!selectedDetailPerson) return;
        const text = `ইমাম খাদ্য সেবা তথ্য:\nপিতার নাম: ${selectedDetailPerson.father || ''}\nছেলের নাম: ${selectedDetailPerson.son || ''}\nমোবাইল: ${selectedDetailPerson.phone || ''}\nঠিকানা: ${selectedDetailPerson.desc || ''}`;
        navigator.clipboard.writeText(text).then(() => {
            showToast("তথ্য কপি করা হয়েছে!");
        });
    }

    function togglePause() { 
        isPaused = !isPaused; 
        pushToFirebase();
        showToast(isPaused ? "রোটেশন পজ করা হয়েছে" : "রোটেশন চালু হয়েছে");
    }

    function updatePauseUI() {
        const btn = document.getElementById('pauseBtn');
        btn.innerText = isPaused ? "রোটেশন পুনরায় চালু করুন" : "পজ মোড চালু করুন";
        btn.style.background = isPaused ? "var(--primary)" : "var(--accent-yellow)";
        btn.style.color = isPaused ? "#ffffff" : "#000000";
    }

    function addLeaveDate() {
        const val = document.getElementById('leaveDateInput').value;
        if(val && !leaveDates.includes(val)) {
            leaveDates.push(val);
            pushToFirebase();
            showToast("ছুটির দিন যোগ করা হয়েছে");
        }
    }

    function renderLeaves() {
        const container = document.getElementById('leaveBadgeContainer');
        container.innerHTML = '';
        leaveDates.forEach(d => {
            const badge = document.createElement('span');
            badge.style.cssText = "background:var(--border-color); padding:3px 8px; border-radius:6px; font-size:0.72rem; display:inline-flex; align-items:center; gap:5px;";
            badge.innerHTML = `${d} <strong onclick="removeLeave('${d}')" style="cursor:pointer; color:red; font-size:0.9rem;">×</strong>`;
            container.appendChild(badge);
        });
    }

    function removeLeave(d) {
        leaveDates = leaveDates.filter(item => item !== d);
        pushToFirebase();
        showToast("ছুটি বাতিল করা হয়েছে");
    }

    // -----------------------------------------------------------
    // ৫. হোয়াটসঅ্যাপ মেসেজ পাঠানো
    // -----------------------------------------------------------
    function sendWhatsApp() {
        const activeIdx = getCurrentIndex();
        const current = peopleList[activeIdx] || {};
        const father = current.father || (document.getElementById('heroFather') ? document.getElementById('heroFather').innerText : 'নামহীন');
        const son = current.son || (document.getElementById('heroSon') ? document.getElementById('heroSon').innerText : 'নেই');
        const msg = `আসসালামু আলাইকুম, আজ মসজিদে সম্মানিত ইমাম সাহেবের খাবারের দিন।\n\nগৃহপ্রধান/পিতা: ${father}\nছেলে: ${son}`;
        
        window.location.href = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    }

    // -----------------------------------------------------------
    // ৬. ১০০% নিখুঁত ফুল-উইডথ নোটিশ প্রিন্ট জেনারেটর
    // -----------------------------------------------------------
    function printSchedule() {
        try {
            const existingSheet = document.getElementById('printOnlyNoticeSheet');
            if (existingSheet) existingSheet.remove();

            const printSheet = document.createElement('div');
            printSheet.id = 'printOnlyNoticeSheet';

            const today = new Date();
            const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
            const todayStr = today.toLocaleDateString('bn-BD', dateOptions);
            const activeIdx = getCurrentIndex();

            let tableRowsHtml = '';
            peopleList.forEach((person, idx) => {
                let daysDiff = (idx - activeIdx + peopleList.length) % peopleList.length;
                const scheduleDate = new Date();
                scheduleDate.setDate(today.getDate() + daysDiff);

                const dayName = scheduleDate.toLocaleDateString('bn-BD', { weekday: 'short' });
                const dateStr = scheduleDate.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' });
                const isToday = (idx === activeIdx);

                tableRowsHtml += `
                    <tr style="${isToday ? 'background-color: #e0e7ff !important; font-weight: bold;' : (idx % 2 === 0 ? 'background-color: #f8fafc;' : '')}">
                        <td style="border: 1px solid #94a3b8; padding: 6px 4px; text-align: center; font-size: 9.5pt;">${idx + 1}</td>
                        <td style="border: 1px solid #94a3b8; padding: 6px 4px; text-align: center; font-size: 9.5pt;">
                            <strong>${dateStr}</strong> (${dayName})
                            ${isToday ? '<br><span style="font-size: 7.5pt; color: #4338ca;">[আজকের দিন]</span>' : ''}
                        </td>
                        <td style="border: 1px solid #94a3b8; padding: 6px 6px; font-size: 9.5pt;">
                            <strong style="font-size: 10pt;">${person.father || 'নামহীন'}</strong>
                            ${person.role ? `<span style="font-size: 8pt; color: #475569;"> (${person.role})</span>` : ''}
                            ${person.phone ? `<div style="font-size: 8pt; color: #334155; margin-top: 1px;">মোবাইল: ${person.phone}</div>` : ''}
                        </td>
                        <td style="border: 1px solid #94a3b8; padding: 6px 6px; font-size: 9.5pt;">${person.son || '-'}</td>
                        <td style="border: 1px solid #94a3b8; padding: 6px 4px; text-align: center; font-size: 9.5pt;">${person.mealType || 'তিন বেলা'}</td>
                        <td style="border: 1px solid #94a3b8; padding: 6px 4px; text-align: center; font-size: 9.5pt;"></td>
                    </tr>
                `;
            });

            printSheet.innerHTML = `
                <div style="width: 100%; font-family: 'Hind Siliguri', sans-serif;">
                    <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;">
                        <div style="font-size: 14pt; font-weight: 600; color: #334155; margin-bottom: 2px;">বিস্‌মিল্লাহির রহ্‌মানির রহীম</div>
                        <div style="font-size: 20pt; font-weight: 800; color: #0f172a; margin-bottom: 2px;">সম্মানিত ইমাম সাহেবের খাবার পরিবেশন সূচী</div>
                        <div style="font-size: 11pt; color: #475569; font-weight: 500;">বাইতুল আমান জামে মসজিদ — ইমাম খাদ্য সেবা ব্যবস্থাপনা</div>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 9.5pt; margin-bottom: 10px; padding: 5px 10px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: 600;">
                        <span>তালিকা প্রকাশের তারিখ: ${todayStr}</span>
                        <span>মোট পরিবার: ${peopleList.length} টি</span>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
                        <thead>
                            <tr style="background-color: #e2e8f0;">
                                <th style="border: 1px solid #64748b; padding: 7px 4px; font-size: 10pt; width: 7%;">ক্রমিক</th>
                                <th style="border: 1px solid #64748b; padding: 7px 4px; font-size: 10pt; width: 22%;">তারিখ ও বার</th>
                                <th style="border: 1px solid #64748b; padding: 7px 6px; font-size: 10pt; width: 27%;">পিতার নাম (গৃহপ্রধান)</th>
                                <th style="border: 1px solid #64748b; padding: 7px 6px; font-size: 10pt; width: 18%;">ছেলের নাম</th>
                                <th style="border: 1px solid #64748b; padding: 7px 4px; font-size: 10pt; width: 14%;">খাবারের ধরণ</th>
                                <th style="border: 1px solid #64748b; padding: 7px 4px; font-size: 10pt; width: 12%;">স্বাক্ষর</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>

                    <div style="margin-top: 16px; display: flex; justify-content: space-between; font-size: 8.5pt; color: #64748b; border-top: 1px dashed #94a3b8; padding-top: 6px;">
                        <span>* কোনো কারণে খাবার পাঠাতে সমস্যা হলে পূর্বেই ইমাম সাহেবকে অবহিত করুন।</span>
                        <span>ইমাম খাদ্য সেবা ডিজিটাল নোটিশ বোর্ড</span>
                    </div>
                </div>
            `;

            document.body.appendChild(printSheet);

            setTimeout(() => {
                if (window.AndroidApp && typeof window.AndroidApp.printPage === 'function') {
                    window.AndroidApp.printPage();
                } else {
                    window.print();
                }

                setTimeout(() => {
                    if (printSheet && printSheet.parentNode) {
                        printSheet.parentNode.removeChild(printSheet);
                    }
                }, 800);
            }, 150);

        } catch (err) {
            console.error("Print Error:", err);
            window.print();
        }
    }

    // -----------------------------------------------------------
    // ৭. স্মার্ট ব্যাকআপ এক্সপোর্ট ও ইমপোর্ট
    // -----------------------------------------------------------
    function openBackupModal() {
        const backupData = {
            peopleList: peopleList,
            isPaused: isPaused,
            leaveDates: leaveDates,
            manualTodayIndex: manualTodayIndex,
            committeeList: committeeList,
            exportedAt: new Date().toISOString()
        };
        const jsonString = JSON.stringify(backupData, null, 2);

        document.getElementById('backupJsonPreview').value = jsonString;
        document.getElementById('backupModal').style.display = 'flex';
    }

    function downloadBackupDirectFile() {
        const text = document.getElementById('backupJsonPreview').value;
        if (window.AndroidApp && typeof window.AndroidApp.saveBackupData === 'function') {
            window.AndroidApp.saveBackupData(text);
        } else {
            const blob = new Blob([text], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `food_schedule_backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast("ব্যাকআপ ডাউনলোড শুরু হয়েছে");
        }
    }

    function copyBackupJson() {
        const text = document.getElementById('backupJsonPreview').value;
        navigator.clipboard.writeText(text).then(() => {
            showToast("ব্যাকআপ ডাটা কপি হয়েছে!");
        }).catch(() => {
            showToast("কপি করা যায়নি, টেক্সটটি সিলেক্ট করে কপি করুন।");
        });
    }

    function shareBackupWhatsApp() {
        const text = document.getElementById('backupJsonPreview').value;
        if (window.AndroidApp && typeof window.AndroidApp.shareBackupText === 'function') {
            window.AndroidApp.shareBackupText(text);
        } else {
            const msg = `*ইমাম খাদ্য সেবা - ব্যাকআপ ডাটা*\nতারিখ: ${new Date().toLocaleDateString('bn-BD')}\n\n\`\`\`${text}\`\`\``;
            window.location.href = `whatsapp://send?text=${encodeURIComponent(msg)}`;
        }
    }

    function openImportModal() {
        document.getElementById('importModal').style.display = 'flex';
    }

    function importFromPaste() {
        const text = document.getElementById('pasteImportText').value.trim();
        if (!text) {
            showToast("অনুগ্রহ করে ব্যাকআপ টেক্সট পেস্ট করুন");
            return;
        }
        try {
            const importedData = JSON.parse(text);
            applyImportedData(importedData);
            document.getElementById('importModal').style.display = 'none';
        } catch(e) {
            showToast("ভুল ফরম্যাট! সঠিক JSON ব্যাকআপ পেস্ট করুন");
        }
    }

    function applyImportedData(importedData) {
        if (importedData.peopleList || Array.isArray(importedData)) {
            peopleList = importedData.peopleList || importedData;
            isPaused = importedData.isPaused || false;
            leaveDates = importedData.leaveDates || [];
            manualTodayIndex = importedData.manualTodayIndex ?? null;
            if (importedData.committeeList) committeeList = importedData.committeeList;
            
            pushToFirebase();
            showToast("ডাটা সফলভাবে রিস্টোর হয়েছে!");
        } else {
            showToast("ভুল ব্যাকআপ ফরম্যাট!");
        }
    }

    function handleFileImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                applyImportedData(importedData);
                document.getElementById('importModal').style.display = 'none';
            } catch (err) {
                showToast("JSON ফাইল পড়া সম্ভব হয়নি");
            }
        };
        reader.readAsText(file);
    }

    async function downloadSourceFile(fileName) {
        showToast(fileName + " ডাউনলোড হচ্ছে...");
        try {
            const response = await fetch(fileName + '?t=' + Date.now());
            if (!response.ok) throw new Error('Fetch failed');
            const text = await response.text();
            const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(fileName + " ডাউনলোড সম্পন্ন হয়েছে!");
        } catch (err) {
            console.warn("Direct blob fallback:", err);
            const a = document.createElement('a');
            a.href = fileName;
            a.download = fileName;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast(fileName + " ডাউনলোড শুরু হয়েছে!");
        }
    }