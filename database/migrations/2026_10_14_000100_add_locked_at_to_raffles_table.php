<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A locked raffle keeps its winners: its pre-selected list cannot be
     * changed, no winner can be taken off, and it cannot be deleted or
     * changed back into an ordinary raffle. Playing it again on the screens
     * is still allowed, since that reveals the same winners. Only the owner
     * PIN (RAFFLE_OWNER_PIN) unlocks it.
     */
    public function up(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->timestamp('locked_at')->nullable()->after('is_predraw');
        });
    }

    public function down(): void
    {
        Schema::table('raffles', function (Blueprint $table) {
            $table->dropColumn('locked_at');
        });
    }
};
